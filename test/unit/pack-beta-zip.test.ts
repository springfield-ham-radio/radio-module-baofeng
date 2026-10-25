import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MAX_BETA_ZIP_BYTES,
  expectedBetaZipName,
  formatBetaPackOutput,
  packBetaZip,
  packedBetaVersion,
} from '@springfield/ham-radio-utils';
import { describe, expect, it } from 'vitest';
import {
  closurePathsForConfig,
  packRadioModuleReleases,
  parseConfigDescriptor,
} from '../../scripts/pack-release-zip.mjs';

const rootDirectory = join(import.meta.dirname, '../..');

function betaOutputDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'pack-beta-out-'));
}

function zipHasOnlyPaths(zipPath: string, expectedPaths: string[]): void {
  const listing = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  expect(listing.status).toBe(0);
  const paths = listing.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .sort();
  expect(paths).toEqual([...expectedPaths].sort());
}

describe('pack:beta for baofeng-uv5r', { sequential: true }, () => {
  it('packs the UV-5R config with a beta version and leaves the working tree unchanged', () => {
    const before = readFileSync(join(rootDirectory, 'configs/baofeng-uv5r.json'), 'utf8');
    const descriptor = parseConfigDescriptor(rootDirectory, 'baofeng-uv5r.json');
    const releasePaths = closurePathsForConfig(rootDirectory, descriptor);

    const outputDirectory = betaOutputDirectory();
    const result = packBetaZip(rootDirectory, 'baofeng-uv5r', 1, { outputDirectory });

    expect(result.zipName).toBe(expectedBetaZipName('baofeng-uv5r', descriptor.configVersion, 1));
    expect(result.packedVersion).toBe(packedBetaVersion(descriptor.configVersion, 1));
    expect(existsSync(result.zipPath)).toBe(true);
    expect(statSync(result.zipPath).size).toBeLessThanOrEqual(MAX_BETA_ZIP_BYTES);

    const after = readFileSync(join(rootDirectory, 'configs/baofeng-uv5r.json'), 'utf8');
    expect(after).toBe(before);

    zipHasOnlyPaths(result.zipPath, releasePaths);

    const extracted = spawnSync('unzip', ['-p', result.zipPath, 'configs/baofeng-uv5r.json'], {
      encoding: 'utf8',
    });
    expect(extracted.status).toBe(0);
    const packedConfig = JSON.parse(extracted.stdout) as { version: string };
    expect(packedConfig.version).toBe(result.packedVersion);

    const hash = createHash('sha256').update(readFileSync(result.zipPath)).digest('hex');
    expect(result.sha256).toBe(`sha256:${hash}`);
    expect(formatBetaPackOutput(result)).toContain(result.zipPath);
    expect(formatBetaPackOutput(result)).toContain(result.sha256);
    rmSync(outputDirectory, { recursive: true, force: true });
  });

  it('uses the same $ref closure as pack:release and keeps other zips', () => {
    const descriptor = parseConfigDescriptor(rootDirectory, 'baofeng-uv5r.json');
    const releasePaths = closurePathsForConfig(rootDirectory, descriptor);

    const releaseResult = packRadioModuleReleases(rootDirectory, {
      forceAll: true,
      releaseVersion: '9.9.9',
    });
    expect(releaseResult.zips).toHaveLength(1);

    const listing = spawnSync('unzip', ['-Z1', releaseResult.zips[0]!.zipPath], { encoding: 'utf8' });
    expect(listing.status).toBe(0);
    const releaseZipPaths = listing.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .sort();

    expect(releasePaths).toEqual(releaseZipPaths);

    const outputDirectory = betaOutputDirectory();
    const keeperPath = join(outputDirectory, 'radio-module-baofeng-uv5r-3.7.0.zip');
    writeFileSync(keeperPath, 'placeholder');

    const { zipPath } = packBetaZip(rootDirectory, 'baofeng-uv5r', 2, { outputDirectory });

    zipHasOnlyPaths(zipPath, releasePaths);
    expect(zipPath.endsWith(expectedBetaZipName('baofeng-uv5r', descriptor.configVersion, 2))).toBe(true);
    expect(existsSync(keeperPath)).toBe(true);
    rmSync(outputDirectory, { recursive: true, force: true });
  });
});
