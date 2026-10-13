#!/usr/bin/env node
/**
 * Build one JSON zip per configs/*.json for GitHub Releases (ADR 0009).
 *
 * Usage: node scripts/pack-release-zip.mjs [releaseVersion]
 *   releaseVersion — manufacturer repo semver (semantic-release nextRelease.version).
 *   Used only for downloadUrl (.../releases/download/v<releaseVersion>/...).
 *
 * Writes dist-release/radio-module-<modelId>-<config.version>.zip (changed configs only
 * when releaseVersion is set and GitHub lists prior assets), and dist-release/catalog-entries.json.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareDriverSemver } from './check-driver-versions.mjs';

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
/**
 * Per-radio assets only. Model id must contain a hyphen (`baofeng-uv5r`), matching
 * registry schema v3. Manufacturer bundles (`radio-module-baofeng-3.7.2.zip`) do not match.
 */
const PER_RADIO_ASSET_PATTERN = /^radio-module-([a-z0-9]+(?:-[a-z0-9]+)+)-(\d+\.\d+\.\d+)\.zip$/;

/**
 * @param {string} moduleRoot
 * @param {object} [options]
 * @param {string} [options.releaseVersion] Manufacturer package version for download URLs.
 * @param {Record<string, string>} [options.publishedVersionsByModel] Highest published config version per model id.
 * @param {boolean} [options.forceAll] Emit every config even when already published.
 * @returns {{ zips: Array<{ zipName: string; zipPath: string; integrity: string; modelId: string; configVersion: string }>; catalogEntries: object[]; catalogEntriesPath: string }}
 */
export function packRadioModuleReleases(moduleRoot, options = {}) {
  const packageJson = JSON.parse(readFileSync(join(moduleRoot, 'package.json'), 'utf8'));
  const releaseVersion = options.releaseVersion ?? packageJson.version;
  const outputDirectory = join(moduleRoot, 'dist-release');
  const slug = githubRepoSlug(packageJson);
  const publishedByModel =
    options.publishedVersionsByModel ??
    (options.forceAll ? {} : publishedConfigVersionsByModel(slug));

  mkdirSync(outputDirectory, { recursive: true });
  clearPerRadioZips(outputDirectory);

  const configs = loadRadioConfigs(moduleRoot);
  const zips = [];
  const catalogEntries = [];

  for (const radio of configs) {
    const published = publishedByModel[radio.modelId];
    const shouldPack =
      options.forceAll ||
      published === undefined ||
      compareDriverSemver(radio.configVersion, published) > 0;

    if (!shouldPack) {
      continue;
    }

    const zipName = `radio-module-${radio.modelId}-${radio.configVersion}.zip`;
    const zipPath = join(outputDirectory, zipName);
    const files = closureRepoPaths(moduleRoot, radio.relativeConfig, radio.parsed);

    createZip(moduleRoot, zipPath, files);

    const hash = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
    const integrity = `sha256:${hash}`;

    if (!slug) {
      throw new Error('package.json repository must be a GitHub URL for catalog downloadUrl');
    }

    catalogEntries.push(
      buildCatalogEntry(packageJson, radio, zipName, integrity, releaseVersion, slug),
    );
    zips.push({
      zipName,
      zipPath,
      integrity,
      modelId: radio.modelId,
      configVersion: radio.configVersion,
    });
  }

  const catalogEntriesPath = join(outputDirectory, 'catalog-entries.json');
  writeFileSync(catalogEntriesPath, `${JSON.stringify(catalogEntries, null, 2)}\n`);

  return { zips, catalogEntries, catalogEntriesPath };
}

function loadRadioConfigs(moduleRoot) {
  const configDirectory = join(moduleRoot, 'configs');

  return readdirSync(configDirectory)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .map((fileName) => {
      const relativeConfig = `configs/${fileName}`;
      const absoluteConfig = join(moduleRoot, relativeConfig);
      let parsed;

      try {
        parsed = JSON.parse(readFileSync(absoluteConfig, 'utf8'));
      } catch {
        throw new Error(`${relativeConfig} is not valid JSON`);
      }

      const modelId = parsed?.id?.model;
      const name = parsed?.id?.name;
      const configVersion = parsed?.version;
      const minApiVersion = parsed?.minApiVersion;

      if (typeof modelId !== 'string' || modelId.length === 0) {
        throw new Error(`${relativeConfig} is missing id.model`);
      }

      if (typeof name !== 'string' || name.length === 0) {
        throw new Error(`${relativeConfig} is missing id.name`);
      }

      if (!isConfigVersion(configVersion)) {
        throw new Error(`${relativeConfig} version must be major.minor.patch`);
      }

      if (!isConfigVersion(minApiVersion)) {
        throw new Error(`${relativeConfig} minApiVersion must be major.minor.patch`);
      }

      const expectedConfigPath = `configs/${modelId}.json`;

      if (relativeConfig !== expectedConfigPath) {
        throw new Error(`${relativeConfig} must be named ${expectedConfigPath} (id.model)`);
      }

      return {
        relativeConfig,
        fileName,
        parsed,
        modelId,
        name,
        configVersion,
        minApiVersion,
        manufacturer: parsed?.id?.manufacturer ?? packageManufacturer(moduleRoot),
      };
    });
}

function packageManufacturer(moduleRoot) {
  const packageJson = JSON.parse(readFileSync(join(moduleRoot, 'package.json'), 'utf8'));
  const manufacturer = packageJson.springfield?.manufacturer;

  if (typeof manufacturer !== 'string' || manufacturer.length === 0) {
    throw new Error('package.json springfield.manufacturer is required when config id.manufacturer is missing');
  }

  return manufacturer;
}

function isConfigVersion(version) {
  return typeof version === 'string' && VERSION_PATTERN.test(version);
}

function closureRepoPaths(moduleRoot, relativeConfig, parsed) {
  const paths = new Set([relativeConfig]);
  const seenAbsolute = new Set();
  const queue = [{ value: parsed, fromDirectory: dirname(join(moduleRoot, relativeConfig)) }];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    for (const absolutePath of localRefPaths(current.value, current.fromDirectory)) {
      if (seenAbsolute.has(absolutePath)) {
        continue;
      }

      seenAbsolute.add(absolutePath);

      const relativePath = toRepoRelative(moduleRoot, absolutePath);

      if (relativePath === undefined) {
        throw new Error(`${relativeConfig} $ref escapes the repository: ${absolutePath}`);
      }

      const absoluteFile = join(moduleRoot, relativePath);

      if (!existsSync(absoluteFile)) {
        throw new Error(`${relativeConfig} $ref target is missing: ${relativePath}`);
      }

      paths.add(relativePath);

      let nested;

      try {
        nested = JSON.parse(readFileSync(absoluteFile, 'utf8'));
      } catch {
        continue;
      }

      queue.push({ value: nested, fromDirectory: dirname(absoluteFile) });
    }
  }

  return [...paths].sort();
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

function createZip(moduleRoot, zipPath, repoRelativePaths) {
  if (existsSync(zipPath)) {
    unlinkSync(zipPath);
  }

  const zipResult = spawnSync('zip', ['-r', zipPath, ...repoRelativePaths, '-x', '*.DS_Store'], {
    cwd: moduleRoot,
    encoding: 'utf8',
  });

  if (zipResult.status !== 0) {
    throw new Error(zipResult.stderr || zipResult.stdout || 'zip failed');
  }
}

function clearPerRadioZips(outputDirectory) {
  if (!existsSync(outputDirectory)) {
    return;
  }

  for (const entry of readdirSync(outputDirectory)) {
    if (entry.startsWith('radio-module-') && entry.endsWith('.zip')) {
      unlinkSync(join(outputDirectory, entry));
    }
  }
}

function buildCatalogEntry(pkg, radio, zipName, integrity, releaseVersion, slug) {
  const description =
    typeof radio.parsed.description === 'string' && radio.parsed.description.length > 0
      ? radio.parsed.description
      : undefined;

  return {
    id: radio.modelId,
    package: `@springfield/radio-module-${radio.modelId}`,
    manufacturer: radio.manufacturer,
    name: radio.name,
    ...(description ? { description } : {}),
    version: radio.configVersion,
    config: `configs/${radio.modelId}.json`,
    minApiVersion: radio.minApiVersion,
    downloadUrl: `https://github.com/${slug}/releases/download/v${releaseVersion}/${zipName}`,
    integrity,
  };
}

function githubRepoSlug(pkg) {
  const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;

  if (typeof url !== 'string') {
    return undefined;
  }

  const match = url.match(/github\.com\/([^/]+\/[^/.]+)/);
  return match?.[1]?.replace(/\.git$/, '');
}

/**
 * Parse a GitHub Release asset name. Manufacturer bundles such as
 * `radio-module-baofeng-3.7.2.zip` return undefined.
 *
 * @param {string} name
 * @returns {{ modelId: string, configVersion: string } | undefined}
 */
export function releaseAssetModelVersion(name) {
  const match = PER_RADIO_ASSET_PATTERN.exec(name);

  if (!match) {
    return undefined;
  }

  return { modelId: match[1], configVersion: match[2] };
}

/**
 * @param {string[]} assetNames
 * @returns {Record<string, string>} Highest config version per model id
 */
export function highestPublishedConfigVersions(assetNames) {
  const maxByModel = {};

  for (const name of assetNames) {
    const parsed = releaseAssetModelVersion(name);

    if (!parsed) {
      continue;
    }

    const previous = maxByModel[parsed.modelId];

    if (previous === undefined || compareDriverSemver(parsed.configVersion, previous) > 0) {
      maxByModel[parsed.modelId] = parsed.configVersion;
    }
  }

  return maxByModel;
}

/**
 * @param {string | undefined} slug owner/repo
 * @returns {Record<string, string>}
 */
export function publishedConfigVersionsByModel(slug) {
  if (!slug) {
    return {};
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const result = spawnSync('gh', ['api', '--paginate', '--slurp', `repos/${slug}/releases?per_page=100`], {
    encoding: 'utf8',
    env: token ? { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token } : process.env,
  });

  if (result.status !== 0) {
    return {};
  }

  let pages;

  try {
    pages = JSON.parse(result.stdout);
  } catch {
    return {};
  }

  const releases = Array.isArray(pages) && Array.isArray(pages[0]) ? pages.flat() : pages;

  if (!Array.isArray(releases)) {
    return {};
  }

  const assetNames = [];

  for (const release of releases) {
    if (release?.draft || release?.prerelease) {
      continue;
    }

    const assets = Array.isArray(release.assets) ? release.assets : [];

    for (const asset of assets) {
      if (typeof asset?.name === 'string') {
        assetNames.push(asset.name);
      }
    }
  }

  return highestPublishedConfigVersions(assetNames);
}

function isCli() {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isCli()) {
  const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
  const releaseVersion = process.argv[2];
  const forceAll = process.env.PACK_RELEASE_ALL === '1' || process.env.PACK_RELEASE_ALL === 'true';

  try {
    const result = packRadioModuleReleases(rootDirectory, {
      ...(releaseVersion ? { releaseVersion } : {}),
      ...(forceAll ? { forceAll: true } : {}),
    });

    console.log(
      JSON.stringify(
        {
          releaseVersion: releaseVersion ?? JSON.parse(readFileSync(join(rootDirectory, 'package.json'), 'utf8')).version,
          catalogEntriesPath: result.catalogEntriesPath,
          zips: result.zips,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
