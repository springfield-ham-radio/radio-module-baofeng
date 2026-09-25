import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { driverVersionBumpFailures } from '../../scripts/check-driver-versions.mjs';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');

function git(cwd: string, args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  }
}

function writeDriver(root: string, version: string, mapBody = '{ "structs": [] }'): void {
  mkdirSync(join(root, 'configs'), { recursive: true });
  mkdirSync(join(root, 'src/shared/memory-maps'), { recursive: true });
  mkdirSync(join(root, 'src/shared/schemas'), { recursive: true });
  writeFileSync(join(root, 'src/shared/memory-maps/radio.json'), `${mapBody}\n`);
  writeFileSync(join(root, 'src/shared/schemas/settings.json'), '{ "type": "object" }\n');
  writeFileSync(
    join(root, 'configs/radio.json'),
    `{
  "version": "${version}",
  "memoryMap": { "$ref": "../src/shared/memory-maps/radio.json" },
  "settingsSchema": { "settingsSchema": { "$ref": "../src/shared/schemas/settings.json" } }
}
`,
  );
}

function initRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'driver-version-'));
  git(root, ['init', '-b', 'main']);
  writeDriver(root, '1.0.0');
  git(root, ['add', '.']);
  git(root, ['-c', 'user.email=dev@example.com', '-c', 'user.name=Dev', 'commit', '-m', 'init']);
  return root;
}

describe('driverVersionBumpFailures', () => {
  it('accepts a clean driver', () => {
    const root = initRepo();

    try {
      expect(driverVersionBumpFailures(root, 'HEAD')).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('requires a higher version when the memory map changes', () => {
    const root = initRepo();

    try {
      writeFileSync(join(root, 'src/shared/memory-maps/radio.json'), '{ "structs": [{ "id": "settings" }] }\n');
      const failures = driverVersionBumpFailures(root, 'HEAD');

      expect(failures).toHaveLength(1);
      expect(failures[0]).toContain('configs/radio.json is still 1.0.0');
      expect(failures[0]).toContain('src/shared/memory-maps/radio.json');

      writeDriver(root, '1.0.1', '{ "structs": [{ "id": "settings" }] }');
      expect(driverVersionBumpFailures(root, 'HEAD')).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('requires a higher version when the config changes', () => {
    const root = initRepo();

    try {
      writeFileSync(
        join(root, 'configs/radio.json'),
        `{
  "version": "1.0.0",
  "description": "edited",
  "memoryMap": { "$ref": "../src/shared/memory-maps/radio.json" },
  "settingsSchema": { "settingsSchema": { "$ref": "../src/shared/schemas/settings.json" } }
}
`,
      );

      expect(driverVersionBumpFailures(root, 'HEAD')[0]).toContain('configs/radio.json');

      writeFileSync(
        join(root, 'configs/radio.json'),
        `{
  "version": "1.1.0",
  "description": "edited",
  "memoryMap": { "$ref": "../src/shared/memory-maps/radio.json" },
  "settingsSchema": { "settingsSchema": { "$ref": "../src/shared/schemas/settings.json" } }
}
`,
      );
      expect(driverVersionBumpFailures(root, 'HEAD')).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('bumps every radio that shares a changed schema', () => {
    const root = initRepo();

    try {
      writeFileSync(
        join(root, 'configs/other.json'),
        `{
  "version": "2.0.0",
  "settingsSchema": { "settingsSchema": { "$ref": "../src/shared/schemas/settings.json" } }
}
`,
      );
      git(root, ['add', '.']);
      git(root, ['-c', 'user.email=dev@example.com', '-c', 'user.name=Dev', 'commit', '-m', 'add other']);
      writeFileSync(join(root, 'src/shared/schemas/settings.json'), '{ "type": "object", "additionalProperties": false }\n');

      const failures = driverVersionBumpFailures(root, 'HEAD');

      expect(failures.map((failure) => failure.slice(0, failure.indexOf(' is still')))).toEqual([
        'configs/other.json',
        'configs/radio.json',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an unknown base ref', () => {
    const root = initRepo();

    try {
      expect(() => driverVersionBumpFailures(root, 'not-a-ref')).toThrow('Unknown base ref');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps the UV-5R config version as its own semver', () => {
    const config = JSON.parse(readFileSync(join(rootDirectory, 'configs/baofeng-uv5r.json'), 'utf8')) as {
      version: string;
    };

    expect(config.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
