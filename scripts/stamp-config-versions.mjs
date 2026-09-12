#!/usr/bin/env node
/**
 * Write the module release version onto every radio JSON in configs/.
 * HamBench shows this field when a config is installed from a JSON file.
 * Usage: node scripts/stamp-config-versions.mjs [version]
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const VERSION_LINE_PATTERN = /^ {2}"version": "[^"]+"/m;

/**
 * Replace the top-level `version` field in each `configs/*.json` file.
 * Only that line is rewritten so protocol arrays and `$ref` formatting stay intact.
 *
 * @param {string} rootDirectory Module root that contains `configs/`
 * @param {string} version Semantic-release version to write
 * @returns {string[]} Absolute paths of configs that were updated
 */
export function stampConfigVersions(rootDirectory, version) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid radio config version: ${version}`);
  }

  const configsDirectory = join(rootDirectory, 'configs');
  const updatedPaths = [];

  for (const fileName of readdirSync(configsDirectory)) {
    if (!fileName.endsWith('.json')) {
      continue;
    }

    const configPath = join(configsDirectory, fileName);
    const originalText = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(originalText);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Radio config must be a JSON object: ${configPath}`);
    }

    if (typeof parsed.version !== 'string') {
      throw new Error(`Radio config is missing version: ${configPath}`);
    }

    if (parsed.version === version) {
      continue;
    }

    if (!VERSION_LINE_PATTERN.test(originalText)) {
      throw new Error(`Could not find top-level version field: ${configPath}`);
    }

    const updatedText = originalText.replace(VERSION_LINE_PATTERN, `  "version": "${version}"`);
    const updatedParsed = JSON.parse(updatedText);

    if (updatedParsed.version !== version) {
      throw new Error(`Failed to stamp version on ${configPath}`);
    }

    writeFileSync(configPath, updatedText);
    updatedPaths.push(configPath);
  }

  return updatedPaths;
}

function isCli() {
  const entry = process.argv[1];

  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isCli()) {
  const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
  const packageJson = JSON.parse(readFileSync(join(rootDirectory, 'package.json'), 'utf8'));
  const version = process.argv[2] || packageJson.version;
  const updatedPaths = stampConfigVersions(rootDirectory, version);

  console.log(
    JSON.stringify(
      {
        version,
        updated: updatedPaths.map((configPath) => configPath.slice(rootDirectory.length + 1)),
      },
      null,
      2,
    ),
  );
}
