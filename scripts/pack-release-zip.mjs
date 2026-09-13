#!/usr/bin/env node
/**
 * Build a JSON-only zip of configs + shared schemas/memory maps for GitHub Releases.
 * Usage: node scripts/pack-release-zip.mjs [version]
 * Stamps configs/*.json `version` to match, then writes
 * dist-release/radio-module-baofeng-<version>.zip, dist-release/catalog-module.json,
 * and prints sha256:<hex> plus the radios actually in the zip.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stampConfigVersions } from './stamp-config-versions.mjs';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(rootDirectory, 'package.json'), 'utf8'));
const version = process.argv[2] || packageJson.version;

stampConfigVersions(rootDirectory, version);
const outputDirectory = join(rootDirectory, 'dist-release');
const zipName = `radio-module-baofeng-${version}.zip`;
const zipPath = join(outputDirectory, zipName);

mkdirSync(outputDirectory, { recursive: true });

if (existsSync(zipPath)) {
  unlinkSync(zipPath);
}

const zipResult = spawnSync(
  'zip',
  ['-r', zipPath, 'configs', 'src/shared/schemas', 'src/shared/memory-maps', '-x', '*.DS_Store'],
  {
    cwd: rootDirectory,
    encoding: 'utf8',
  },
);

if (zipResult.status !== 0) {
  console.error(zipResult.stderr || zipResult.stdout || 'zip failed');
  process.exit(zipResult.status ?? 1);
}

const hash = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
const integrity = `sha256:${hash}`;
const radios = catalogRadiosFromConfigs(rootDirectory);
const catalogModule = buildCatalogModule(packageJson, version, zipName, integrity, radios);
const catalogModulePath = join(outputDirectory, 'catalog-module.json');

writeFileSync(catalogModulePath, `${JSON.stringify(catalogModule, null, 2)}\n`);

console.log(JSON.stringify({ zipPath, zipName, integrity, catalogModulePath, radios }, null, 2));

function catalogRadiosFromConfigs(moduleRoot) {
  const configDirectory = join(moduleRoot, 'configs');

  return readdirSync(configDirectory)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .map((fileName) => {
      const config = JSON.parse(readFileSync(join(configDirectory, fileName), 'utf8'));
      const modelId = config?.id?.model;
      const name = config?.id?.name;

      if (typeof modelId !== 'string' || modelId.length === 0 || typeof name !== 'string' || name.length === 0) {
        throw new Error(`configs/${fileName} is missing id.model or id.name`);
      }

      return {
        modelId,
        name,
        config: `configs/${fileName}`,
      };
    });
}

function githubRepoSlug(pkg) {
  const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const match = String(url || '').match(/github\.com\/([^/]+\/[^/.]+)/);
  return match?.[1];
}

function buildCatalogModule(pkg, moduleVersion, moduleZipName, moduleIntegrity, moduleRadios) {
  const slug = githubRepoSlug(pkg);
  const scopedName = String(pkg.name);
  const id = scopedName.replace(/^@[^/]+\//, '').replace(/^radio-module-/, '');

  return {
    id,
    package: scopedName,
    manufacturer: pkg.springfield?.manufacturer,
    ...(typeof pkg.description === 'string' ? { description: pkg.description } : {}),
    version: moduleVersion,
    radios: moduleRadios,
    supportedRadios: moduleRadios.map((radio) => radio.modelId),
    minApiVersion: pkg.springfield?.minApiVersion || '17.3.0',
    downloadUrl: slug
      ? `https://github.com/${slug}/releases/download/v${moduleVersion}/${moduleZipName}`
      : undefined,
    integrity: moduleIntegrity,
  };
}
