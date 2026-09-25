import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampConfigVersions } from '../../scripts/stamp-config-versions.mjs';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('stampConfigVersions', () => {
  it('replaces only the top-level version line', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'baofeng-stamp-'));
    const configsDirectory = join(workspace, 'configs');
    mkdirSync(configsDirectory);

    const originalText = `{
  "$schema": "https://springfield-ham-radio.com/schemas/radio-config-v1.json",
  "version": "1.0.0",
  "readMemory": ["0x02"]
}
`;
    const configPath = join(configsDirectory, 'baofeng-uv5r.json');
    writeFileSync(configPath, originalText);

    try {
      const updatedPaths = stampConfigVersions(workspace, '3.1.0');
      const stampedText = readFileSync(configPath, 'utf8');

      expect(updatedPaths).toEqual([configPath]);
      expect(stampedText).toBe(originalText.replace('1.0.0', '3.1.0'));
      expect(stampedText).toContain('"readMemory": ["0x02"]');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('keeps the UV-5R config version as its own semver', () => {
    const config = JSON.parse(readFileSync(join(rootDirectory, 'configs/baofeng-uv5r.json'), 'utf8')) as {
      version: string;
    };

    expect(config.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('rejects a version that is not semver', () => {
    expect(() => stampConfigVersions(rootDirectory, 'not-a-version')).toThrow('Invalid radio config version');
  });
});
