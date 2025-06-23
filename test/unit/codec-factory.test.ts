import { describe, it } from 'node:test';
import { expect } from 'chai';
import { MockLogLayer } from 'loglayer';
import { CodecFactory } from '../../src/codec-factory.js';
import type { RadioModelId } from '@springfield/ham-radio-api';

describe('BaofengCodecFactory', () => {
  it('should create a BaofengCodec instance', async () => {
    const factory = new CodecFactory();
    const logger = new MockLogLayer();
    const modelId: RadioModelId = { model: 'baofeng-uv5r', name: 'Baofeng UV-5R', manufacturer: 'Baofeng' };
    const config = {
      channelMemorySegment: { startAddress: 0, endAddress: 6143 },
      settingsMemorySegment: { startAddress: 7872, endAddress: 8191 },
      memorySegmentSize: 64,
      magicNumber: [80, 187, 255, 32, 18, 7, 37],
      receiveFrequencyOffset: 0,
      transmitFrequencyOffset: 4,
      receiveToneOffset: 8,
      transmitToneOffset: 10,
      powerOffset: 12,
      channelSize: 16,
      numberChannels: 128,
      radioSettingsSchemaPath: 'shared/schemas/settings-schema.json',
      channelSettingsSchemaPath: 'shared/schemas/channel-schema.json',
    };

    const codec = await factory.createCodec(modelId, config, logger);

    expect(codec).to.not.be.undefined;
    expect(codec).to.have.property('decode');
    expect(codec).to.have.property('encode');
    expect(typeof codec.decode).to.equal('function');
    expect(typeof codec.encode).to.equal('function');
  });
}); 