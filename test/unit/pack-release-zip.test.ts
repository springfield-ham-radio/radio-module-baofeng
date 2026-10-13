import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseModuleCatalog } from '@springfield/ham-radio-registry';
import { describe, expect, it } from 'vitest';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import {
  highestPublishedConfigVersions,
  packRadioModuleReleases,
  publishedConfigVersionsByModel,
  releaseAssetModelVersion,
} from '../../scripts/pack-release-zip.mjs';

const rootDirectory = join(import.meta.dirname, '../..');

function zipEntries(zipPath: string): string[] {
  const result = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'unzip failed');
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

describe('packRadioModuleReleases', () => {
  it('packs the UV-5R config, ref closure, and catalog entries', () => {
    const result = packRadioModuleReleases(rootDirectory, { forceAll: true, releaseVersion: '9.9.9' });

    expect(result.zips).toHaveLength(1);
    expect(result.zips[0]?.zipName).toBe('radio-module-baofeng-uv5r-3.7.0.zip');

    const entries = zipEntries(result.zips[0]!.zipPath);

    expect(entries).toEqual([
      'configs/baofeng-uv5r.json',
      'src/shared/memory-maps/uv5r-settings.json',
      'src/shared/schemas/channel-schema.json',
      'src/shared/schemas/settings-schema.json',
    ]);

    expect(result.catalogEntries).toHaveLength(1);
    expect(result.catalogEntries[0]).toMatchObject({
      id: 'baofeng-uv5r',
      package: '@springfield/radio-module-baofeng-uv5r',
      manufacturer: 'Baofeng',
      name: 'Baofeng UV-5R',
      version: '3.7.0',
      config: 'configs/baofeng-uv5r.json',
      minApiVersion: '18.0.1',
      downloadUrl:
        'https://github.com/springfield-ham-radio/radio-module-baofeng/releases/download/v9.9.9/radio-module-baofeng-uv5r-3.7.0.zip',
    });

    const onDisk = JSON.parse(readFileSync(result.catalogEntriesPath, 'utf8')) as unknown[];
    const catalog = parseModuleCatalog(
      JSON.stringify({
        schemaVersion: 3,
        modules: onDisk,
      }),
    );

    expect(catalog.modules).toHaveLength(1);
    expect(catalog.modules[0]?.integrity).toBe(result.zips[0]?.integrity);

    const expectedIntegrity = `sha256:${createHash('sha256')
      .update(readFileSync(result.zips[0]!.zipPath))
      .digest('hex')}`;
    expect(result.zips[0]?.integrity).toBe(expectedIntegrity);
  });

  it('skips radios whose config version is already on a release asset', () => {
    const result = packRadioModuleReleases(rootDirectory, {
      releaseVersion: '3.7.2',
      publishedVersionsByModel: { 'baofeng-uv5r': '3.7.0' },
    });

    expect(result.zips).toHaveLength(0);
    expect(result.catalogEntries).toHaveLength(0);
  });

  it('requires minApiVersion on configs', () => {
    const root = mkdtempSync(join(tmpdir(), 'pack-release-'));

    try {
      mkdirSync(join(root, 'configs'), { recursive: true });
      mkdirSync(join(root, 'src/shared/schemas'), { recursive: true });
      writeFileSync(join(root, 'src/shared/schemas/settings.json'), '{}\n');
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          name: '@springfield/radio-module-example',
          version: '1.0.0',
          repository: 'https://github.com/springfield-ham-radio/radio-module-example',
          springfield: { manufacturer: 'Example' },
        }),
      );
      writeFileSync(
        join(root, 'configs/example-radio.json'),
        JSON.stringify({
          id: { model: 'example-radio', name: 'Example Radio', manufacturer: 'Example' },
          version: '1.0.0',
          settingsSchema: { settingsSchema: { $ref: '../src/shared/schemas/settings.json' } },
        }),
      );

      expect(() => packRadioModuleReleases(root, { forceAll: true })).toThrow('minApiVersion');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not treat manufacturer bundle zips as a published UV-5R', () => {
    const publishedNames = [
      'radio-module-baofeng-3.7.2.zip',
      'radio-module-baofeng-3.6.1.zip',
      'radio-module-baofeng-3.5.0.zip',
    ];

    expect(releaseAssetModelVersion('radio-module-baofeng-3.7.2.zip')).toBeUndefined();
    expect(releaseAssetModelVersion('radio-module-baofeng-uv5r-3.7.0.zip')).toEqual({
      modelId: 'baofeng-uv5r',
      configVersion: '3.7.0',
    });
    expect(highestPublishedConfigVersions(publishedNames)).toEqual({});

    const result = packRadioModuleReleases(rootDirectory, {
      releaseVersion: '4.0.0',
      publishedVersionsByModel: highestPublishedConfigVersions(publishedNames),
    });

    expect(result.zips.map((zip) => zip.zipName)).toEqual(['radio-module-baofeng-uv5r-3.7.0.zip']);
    expect(result.catalogEntries[0]?.downloadUrl).toBe(
      'https://github.com/springfield-ham-radio/radio-module-baofeng/releases/download/v4.0.0/radio-module-baofeng-uv5r-3.7.0.zip',
    );
  });

  it('follows nested $ref files into the zip', () => {
    const root = mkdtempSync(join(tmpdir(), 'pack-release-'));

    try {
      mkdirSync(join(root, 'configs'), { recursive: true });
      mkdirSync(join(root, 'src/shared/schemas'), { recursive: true });
      writeFileSync(join(root, 'src/shared/schemas/extra.json'), '{ "type": "object" }\n');
      writeFileSync(
        join(root, 'src/shared/schemas/settings.json'),
        '{ "properties": { "extra": { "$ref": "./extra.json" } } }\n',
      );
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          name: '@springfield/radio-module-example',
          version: '1.0.0',
          repository: 'https://github.com/springfield-ham-radio/radio-module-example',
          springfield: { manufacturer: 'Example' },
        }),
      );
      writeFileSync(
        join(root, 'configs/example-radio.json'),
        JSON.stringify({
          id: { model: 'example-radio', name: 'Example Radio', manufacturer: 'Example' },
          version: '1.2.0',
          minApiVersion: '18.0.1',
          settingsSchema: { settingsSchema: { $ref: '../src/shared/schemas/settings.json' } },
        }),
      );

      const result = packRadioModuleReleases(root, { forceAll: true, releaseVersion: '2.0.0' });
      const entries = zipEntries(result.zips[0]!.zipPath);

      expect(entries).toEqual([
        'configs/example-radio.json',
        'src/shared/schemas/extra.json',
        'src/shared/schemas/settings.json',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns no published versions when the GitHub slug is missing', () => {
    expect(publishedConfigVersionsByModel(undefined)).toEqual({});
  });
});

describe('semantic-release', () => {
  it('classifies the ADR 0009 commit as a major release', async () => {
    const log = spawnSync('git', ['log', 'origin/main..HEAD', '--format=%B%x00'], {
      cwd: rootDirectory,
      encoding: 'utf8',
    });

    if (log.status !== 0) {
      throw new Error(log.stderr || 'git log failed');
    }

    const commits = log.stdout
      .split('\0')
      .map((message) => message.trim())
      .filter((message) => message.length > 0)
      .map((message) => ({ message }));

    const releaseType = await analyzeCommits(
      { preset: 'conventionalcommits' },
      { commits, logger: { log() {}, error() {} } },
    );

    expect(releaseType).toBe('major');
  });
});
