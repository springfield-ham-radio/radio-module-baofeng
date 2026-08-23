import { describe, it } from 'node:test';
import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RadioMemoryConfig, RadioMemoryMap } from '@springfield/ham-radio-api';
import { createMemoryMapCodec } from '@springfield/ham-radio-utils';
import { MockLogLayer } from 'loglayer';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(rootDirectory, relativePath), 'utf8'));
}

describe('Baofeng UV-5R DSL module', () => {
  it('should declare a memoryMap codec and hydrate with the shipped map', () => {
    const config = readJson('configs/baofeng-uv5r.json') as {
      codec: { type: string };
      memoryMap: { $ref: string };
      memoryConfig: RadioMemoryConfig;
      id: { model: string };
    };

    expect(config.codec.type).to.equal('memoryMap');
    expect(config.memoryMap.$ref).to.equal('../src/shared/memory-maps/uv5r-settings.json');

    const memoryMap = readJson('src/shared/memory-maps/uv5r-settings.json') as RadioMemoryMap;
    const codec = createMemoryMapCodec({
      radioModel: config.id.model as never,
      memoryMap,
      memoryConfig: config.memoryConfig,
      logger: new MockLogLayer(),
    });

    expect(codec.decode).to.be.a('function');
    expect(codec.encode).to.be.a('function');
  });
});
