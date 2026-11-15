import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CHIRP chirp/drivers/uv5r.py (master):
 * UV5R_MODEL_291 is the post-BFB291 magic for BaofengUV5R (lines 340, 780-782).
 * UV5R_MODEL_A58 is only on BaofengBFF8HPRadio (lines 345, 2342-2344).
 * _do_ident accepts an 8-byte ident and does not match firmware text (lines 390-433).
 * BF-F8HP is separated later by BASETYPE_F8HP, not by a handshake allowlist (lines 285, 2341).
 */
const UV5R_MODEL_291 = ['0x50', '0xBB', '0xFF', '0x20', '0x12', '0x07', '0x25'];
const UV5R_MODEL_A58 = ['0x50', '0xBB', '0xFF', '0x20', '0x14', '0x04', '0x13'];

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');

type ProtocolStep = {
  description?: string;
  send?: string[];
  expect?: string | { bytes?: number };
};

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(rootDirectory, relativePath), 'utf8'));
}

function collectEnumValues(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectEnumValues(item, into);
    }

    return into;
  }

  if (!value || typeof value !== 'object') {
    return into;
  }

  const record = value as { kind?: string; values?: unknown };

  if (record.kind === 'enum' && Array.isArray(record.values)) {
    into.push(...record.values.filter((entry): entry is string => typeof entry === 'string'));
  }

  for (const child of Object.values(record)) {
    collectEnumValues(child, into);
  }

  return into;
}

describe('UV-5R clone handshake', () => {
  const config = readJson('configs/baofeng-uv5r.json') as {
    id: { model: string; name: string };
    version: string;
    description: string;
    readMemory: ProtocolStep[];
    writeMemory: ProtocolStep[];
  };

  it('keeps the UV-5R Plus on the existing UV-5R model', () => {
    expect(config.id.model).toBe('baofeng-uv5r');
    expect(config.id.name).toContain('UV-5R Plus');
    expect(config.description).toContain('UV-5R Plus');
    expect(config.description).toContain('High/Low');
    expect(config.version).toBe('3.8.0');
  });

  it('accepts the CHIRP UV-5R ident without a firmware allowlist', () => {
    for (const steps of [config.readMemory, config.writeMemory]) {
      expect(steps[0]).toMatchObject({
        send: UV5R_MODEL_291,
        expect: '0x06',
      });
      expect(steps[1]).toMatchObject({
        send: ['0x02'],
        expect: { bytes: 8 },
      });
      expect(steps[1]?.expect).not.toHaveProperty('pattern');
      expect(JSON.stringify(steps)).not.toContain(JSON.stringify(UV5R_MODEL_A58));
    }
  });

  it('keeps transmit power at the two UV-5R levels', () => {
    const memoryMap = readJson('src/shared/memory-maps/uv5r-settings.json');
    const powerLabels = collectEnumValues(memoryMap).filter((label) =>
      ['High', 'Mid', 'Medium', 'Low'].includes(label),
    );

    expect(powerLabels).toEqual(['High', 'Low', 'High', 'Low']);
  });
});
