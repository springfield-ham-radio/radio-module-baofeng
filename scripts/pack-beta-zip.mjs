#!/usr/bin/env node
/**
 * Build one local beta driver zip (ADR 0010).
 *
 * Usage: node scripts/pack-beta-zip.mjs <modelId> [n]
 *   n — positive beta counter (default 1, no leading zero).
 *
 * Writes dist-release/radio-module-<modelId>-<version>-beta.<n>.zip without
 * modifying the working tree, catalog entries, or other zips in dist-release/.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closurePathsForConfig } from './pack-release-zip.mjs';

export const STRICT_SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
export const BETA_COUNTER_PATTERN = /^[1-9]\d*$/;
export const MAX_BETA_ZIP_BYTES = 1024 * 1024;

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string} modelId
 * @param {string} baseVersion Strict major.minor.patch from the working tree
 * @param {number} n
 */
export function expectedBetaZipName(modelId, baseVersion, n) {
  return `radio-module-${modelId}-${baseVersion}-beta.${n}.zip`;
}

/**
 * @param {string} packedVersion e.g. 1.11.2-beta.1
 */
export function packedBetaVersion(baseVersion, n) {
  return `${baseVersion}-beta.${n}`;
}

/**
 * @param {string | undefined} raw
 * @returns {number}
 */
export function parseBetaCounter(raw) {
  if (raw === undefined) {
    return 1;
  }

  if (!BETA_COUNTER_PATTERN.test(raw)) {
    throw new Error('beta counter n must be a positive integer with no leading zero');
  }

  return Number(raw);
}

/**
 * @param {string} value
 * @param {string} fieldLabel
 */
export function assertStrictSemver(value, fieldLabel) {
  if (typeof value !== 'string' || !STRICT_SEMVER_PATTERN.test(value)) {
    throw new Error(`${fieldLabel} must be strict major.minor.patch (no prerelease or build metadata)`);
  }
}

/**
 * @param {string} moduleRoot
 * @param {string} modelId
 * @param {number} n
 * @param {{ outputDirectory?: string }} [options]
 */
export function packBetaZip(moduleRoot, modelId, n = 1, options = {}) {
  if (!BETA_COUNTER_PATTERN.test(String(n))) {
    throw new Error('beta counter n must be a positive integer with no leading zero');
  }

  const descriptor = loadDescriptorForPackBeta(moduleRoot, modelId);

  validateBetaDescriptor(descriptor);

  const pathsToZip = closurePathsForConfig(moduleRoot, descriptor);
  const packedVersion = packedBetaVersion(descriptor.configVersion, n);
  const zipName = expectedBetaZipName(descriptor.modelId, descriptor.configVersion, n);
  const outputDirectory = options.outputDirectory ?? join(moduleRoot, 'dist-release');
  const zipPath = join(outputDirectory, zipName);

  mkdirSync(outputDirectory, { recursive: true });

  const stagingRoot = mkdtempSync(join(tmpdir(), 'pack-beta-'));

  try {
    stageClosureWithBetaVersion(moduleRoot, stagingRoot, pathsToZip, descriptor.relativeConfig, packedVersion);
    createZipFromStaging(stagingRoot, zipPath, pathsToZip);
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }

  const size = statSync(zipPath).size;

  if (size > MAX_BETA_ZIP_BYTES) {
    unlinkSync(zipPath);
    throw new Error(`beta zip exceeds ${MAX_BETA_ZIP_BYTES} bytes (${size} bytes)`);
  }

  const sha256 = integrityFromFile(zipPath);
  const gitSha = shortGitSha(moduleRoot);

  return {
    zipPath,
    zipName,
    modelId: descriptor.modelId,
    baseVersion: descriptor.configVersion,
    packedVersion,
    size,
    sha256,
    gitSha,
  };
}

/**
 * Read one config for beta packing without pack:release semver checks so
 * validateBetaDescriptor can report prerelease/build metadata errors.
 *
 * @param {string} moduleRoot
 * @param {string} modelId
 * @returns {import('./pack-release-zip.mjs').ConfigDescriptor}
 */
function loadDescriptorForPackBeta(moduleRoot, modelId) {
  const configDirectory = join(moduleRoot, 'configs');
  const knownModelIds = readdirSync(configDirectory)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => fileName.replace(/\.json$/, ''))
    .sort();

  const relativeConfig = `configs/${modelId}.json`;
  const absoluteConfig = join(moduleRoot, relativeConfig);

  if (!existsSync(absoluteConfig)) {
    throw new Error(`unknown modelId ${modelId}; expected one of: ${knownModelIds.join(', ')}`);
  }

  let parsed;

  try {
    parsed = JSON.parse(readFileSync(absoluteConfig, 'utf8'));
  } catch {
    throw new Error(`${relativeConfig} is not valid JSON`);
  }

  const parsedModelId = parsed?.id?.model;
  const name = parsed?.id?.name;
  const configVersion = parsed?.version;
  const minApiVersion = parsed?.minApiVersion;

  if (typeof parsedModelId !== 'string' || parsedModelId.length === 0) {
    throw new Error(`${relativeConfig} is missing id.model`);
  }

  if (parsedModelId !== modelId) {
    throw new Error(`${relativeConfig} id.model must be ${modelId}`);
  }

  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`${relativeConfig} is missing id.name`);
  }

  if (typeof configVersion !== 'string' || configVersion.length === 0) {
    throw new Error(`${relativeConfig} is missing version`);
  }

  if (typeof minApiVersion !== 'string' || minApiVersion.length === 0) {
    throw new Error(`${relativeConfig} is missing minApiVersion`);
  }

  const expectedConfigPath = `configs/${modelId}.json`;

  if (relativeConfig !== expectedConfigPath) {
    throw new Error(`${relativeConfig} must be named ${expectedConfigPath} (id.model)`);
  }

  const packageJson = JSON.parse(readFileSync(join(moduleRoot, 'package.json'), 'utf8'));
  const manufacturer =
    typeof parsed?.id?.manufacturer === 'string' && parsed.id.manufacturer.length > 0
      ? parsed.id.manufacturer
      : packageJson.springfield?.manufacturer;

  if (typeof manufacturer !== 'string' || manufacturer.length === 0) {
    throw new Error(`${relativeConfig} is missing id.manufacturer`);
  }

  return {
    fileName: `${modelId}.json`,
    relativeConfig,
    modelId,
    name,
    configVersion,
    minApiVersion,
    manufacturer,
    parsed,
  };
}

/**
 * @param {import('./pack-release-zip.mjs').ConfigDescriptor} descriptor
 */
export function validateBetaDescriptor(descriptor) {
  const { relativeConfig, configVersion, minApiVersion } = descriptor;

  if (typeof configVersion !== 'string' || configVersion.length === 0) {
    throw new Error(`${relativeConfig} is missing version`);
  }

  if (configVersion.includes('-') || configVersion.includes('+')) {
    throw new Error(`${relativeConfig} version must not include a prerelease or build metadata suffix`);
  }

  assertStrictSemver(configVersion, `${relativeConfig} version`);
  assertStrictSemver(minApiVersion, `${relativeConfig} minApiVersion`);
}

/**
 * @param {string} moduleRoot
 * @param {string} stagingRoot
 * @param {string[]} relativePaths
 * @param {string} configRelative
 * @param {string} packedVersion
 */
export function stageClosureWithBetaVersion(moduleRoot, stagingRoot, relativePaths, configRelative, packedVersion) {
  for (const relativePath of relativePaths) {
    const sourcePath = join(moduleRoot, relativePath);
    const destPath = join(stagingRoot, relativePath);

    mkdirSync(dirname(destPath), { recursive: true });

    if (relativePath === configRelative) {
      const parsed = JSON.parse(readFileSync(sourcePath, 'utf8'));
      parsed.version = packedVersion;
      writeFileSync(destPath, `${JSON.stringify(parsed, null, 2)}\n`);
    } else {
      cpSync(sourcePath, destPath);
    }
  }
}

/**
 * @param {string} stagingRoot
 * @param {string} zipPath
 * @param {string[]} relativePaths
 */
function createZipFromStaging(stagingRoot, zipPath, relativePaths) {
  if (existsSync(zipPath)) {
    unlinkSync(zipPath);
  }

  const zipResult = spawnSync('zip', ['-q', zipPath, ...relativePaths, '-x', '*.DS_Store'], {
    cwd: stagingRoot,
    encoding: 'utf8',
  });

  if (zipResult.status !== 0) {
    throw new Error(zipResult.stderr || zipResult.stdout || 'zip failed');
  }
}

function integrityFromFile(filePath) {
  const hash = createHash('sha256').update(readFileSync(filePath)).digest('hex');
  return `sha256:${hash}`;
}

/**
 * @param {string} moduleRoot
 * @returns {string | undefined}
 */
export function shortGitSha(moduleRoot) {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: moduleRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return undefined;
  }

  return result.stdout.trim() || undefined;
}

/**
 * @param {{ zipPath: string, size: number, sha256: string, gitSha?: string }} result
 */
export function formatBetaPackOutput(result) {
  const lines = [result.zipPath, String(result.size), result.sha256];

  if (result.gitSha) {
    lines.push(result.gitSha);
  }

  return `${lines.join('\n')}\n`;
}

function isCli() {
  const entry = process.argv[1];
  return Boolean(entry) && fileURLToPath(import.meta.url) === resolve(entry);
}

if (isCli()) {
  const [modelId, nArg] = process.argv.slice(2);

  if (!modelId) {
    console.error('usage: node scripts/pack-beta-zip.mjs <modelId> [n]');
    process.exit(1);
  }

  try {
    const n = parseBetaCounter(nArg);
    const result = packBetaZip(rootDirectory, modelId, n);
    process.stdout.write(formatBetaPackOutput(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
