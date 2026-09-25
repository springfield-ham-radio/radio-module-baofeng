#!/usr/bin/env node
/**
 * Fail when a radio driver changed without a higher configs/*.json version.
 *
 * A driver is one configs/*.json file plus every relative $ref it uses
 * (schemas and memory maps). package.json is the zip version and is not
 * copied onto these files.
 *
 * Usage: node scripts/check-driver-versions.mjs [base-ref]
 * base-ref defaults to HEAD (working tree versus the last commit).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * @param {string} rootDirectory Module root that contains configs/
 * @param {string} [baseRef] Git revision to compare the working tree against
 * @returns {string[]} Human-readable failures. Empty when every changed driver bumped its version.
 */
export function driverVersionBumpFailures(rootDirectory, baseRef = 'HEAD') {
  assertGitRef(rootDirectory, baseRef);

  const configsDirectory = join(rootDirectory, 'configs');

  if (!existsSync(configsDirectory)) {
    return [];
  }

  const failures = [];

  for (const fileName of readdirSync(configsDirectory).filter((entry) => entry.endsWith('.json')).sort()) {
    const relativeConfig = `configs/${fileName}`;
    const headText = readWorkingTree(rootDirectory, relativeConfig);

    if (headText === undefined) {
      continue;
    }

    let headJson;

    try {
      headJson = JSON.parse(headText);
    } catch {
      failures.push(`${relativeConfig} is not valid JSON`);
      continue;
    }

    if (!isDriverVersion(headJson?.version)) {
      failures.push(`${relativeConfig} version must be major.minor.patch`);
      continue;
    }

    const baseText = gitShow(rootDirectory, baseRef, relativeConfig);

    if (baseText === undefined) {
      continue;
    }

    let baseJson;

    try {
      baseJson = JSON.parse(baseText);
    } catch {
      failures.push(`${relativeConfig} changed, but ${baseRef} does not contain valid JSON`);
      continue;
    }

    const configDirectory = dirname(join(rootDirectory, relativeConfig));
    const changed = [];

    if (canonicalConfig(headJson) !== canonicalConfig(baseJson)) {
      changed.push(relativeConfig);
    }

    const refPaths = new Set([
      ...localRefPaths(headJson, configDirectory),
      ...localRefPaths(baseJson, configDirectory),
    ]);

    for (const absolutePath of refPaths) {
      const relativePath = toRepoRelative(rootDirectory, absolutePath);

      if (relativePath === undefined) {
        continue;
      }

      if (normalizeFile(readWorkingTree(rootDirectory, relativePath)) !== normalizeFile(gitShow(rootDirectory, baseRef, relativePath))) {
        changed.push(relativePath);
      }
    }

    const baseVersion = isDriverVersion(baseJson?.version) ? baseJson.version : '0.0.0';

    if (changed.length > 0 && compareDriverSemver(headJson.version, baseVersion) <= 0) {
      failures.push(
        `${relativeConfig} is still ${headJson.version}; bump its version because these driver files changed: ${changed.join(', ')}`,
      );
    }
  }

  return failures;
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {number} Negative when left < right, 0 when equal, positive when left > right
 */
export function compareDriverSemver(left, right) {
  const a = semverParts(left);
  const b = semverParts(right);

  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return a[index] - b[index];
    }
  }

  return 0;
}

function isDriverVersion(version) {
  return typeof version === 'string' && VERSION_PATTERN.test(version);
}

function semverParts(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);

  if (!match) {
    throw new Error(`Invalid radio driver version: ${version}`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function canonicalConfig(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return JSON.stringify(parsed);
  }

  const { version: _version, ...rest } = parsed;
  return JSON.stringify(rest);
}

function normalizeFile(text) {
  if (text === undefined) {
    return '';
  }

  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

function localRefPaths(value, fromDirectory, into = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      localRefPaths(item, fromDirectory, into);
    }

    return into;
  }

  if (!value || typeof value !== 'object') {
    return into;
  }

  if (typeof value.$ref === 'string' && isLocalRef(value.$ref)) {
    into.add(resolve(fromDirectory, value.$ref));
  }

  for (const child of Object.values(value)) {
    localRefPaths(child, fromDirectory, into);
  }

  return into;
}

function isLocalRef(ref) {
  return ref.length > 0 && !ref.startsWith('#') && !/^[a-z][a-z0-9+.-]*:/i.test(ref);
}

function toRepoRelative(rootDirectory, absolutePath) {
  const relativePath = relative(rootDirectory, absolutePath);

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return undefined;
  }

  return relativePath.split(sep).join('/');
}

function readWorkingTree(rootDirectory, relativePath) {
  const absolutePath = join(rootDirectory, relativePath);

  if (!existsSync(absolutePath)) {
    return undefined;
  }

  return readFileSync(absolutePath, 'utf8');
}

function assertGitRef(rootDirectory, ref) {
  const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
    cwd: rootDirectory,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`Unknown base ref: ${ref}`);
  }
}

function gitShow(rootDirectory, ref, relativePath) {
  const result = spawnSync('git', ['show', `${ref}:${relativePath}`], {
    cwd: rootDirectory,
    encoding: 'utf8',
  });

  if (result.status === 0) {
    return result.stdout;
  }

  const errorText = result.stderr || '';

  if (errorText.includes('does not exist') || errorText.includes('exists on disk')) {
    return undefined;
  }

  throw new Error(errorText.trim() || `git show ${ref}:${relativePath} failed`);
}

function isCli() {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isCli()) {
  const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
  const baseRef = process.argv[2] || 'HEAD';

  try {
    const failures = driverVersionBumpFailures(rootDirectory, baseRef);

    if (failures.length > 0) {
      console.error(failures.join('\n'));
      process.exit(1);
    }

    console.log(JSON.stringify({ base: baseRef, ok: true }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
