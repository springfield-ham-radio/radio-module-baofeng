#!/usr/bin/env node
/**
 * Build a JSON-only zip of configs + shared schemas/memory maps for GitHub Releases.
 * Usage: node scripts/pack-release-zip.mjs [version]
 * Writes dist-release/radio-module-baofeng-<version>.zip and prints sha256:<hex>.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(rootDirectory, 'package.json'), 'utf8'));
const version = process.argv[2] || packageJson.version;
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

console.log(JSON.stringify({ zipPath, zipName, integrity }, null, 2));
