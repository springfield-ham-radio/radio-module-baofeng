import { describe, it } from 'node:test';
import { CodecFactory } from '../../src/codec-factory.js';
import { MockLogLayer } from 'loglayer';
import { RadioModelId } from '@springfield/ham-radio-api';
import { expect } from 'chai';


describe('BaofengCodecFactory', () => {
  it('should create a BaofengCodec instance', async () => {
    const factory = new CodecFactory();
    const logger = new MockLogLayer();
    const modelId = RadioModelId('baofeng-uv5r');
    const config = {
      channelMemorySegment: { endAddress: 6143, startAddress: 0 },
      channelSettingsSchemaPath: 'shared/schemas/channel-schema.json',
      channelSize: 16,
      magicNumber: [80, 187, 255, 32, 18, 7, 37],
      memorySegmentSize: 64,
      numberChannels: 128,
      powerOffset: 12,
      radioSettingsSchemaPath: 'shared/schemas/settings-schema.json',
      receiveFrequencyOffset: 0,
      receiveToneOffset: 8,
      settingsMemorySegment: { endAddress: 8191, startAddress: 7872 },
      transmitFrequencyOffset: 4,
      transmitToneOffset: 10,
    };

    const codec = await factory.createCodec(modelId, config, logger);

    expect(codec).to.not.be.undefined;
    expect(codec).to.have.property('decode');
    expect(codec).to.have.property('encode');
    expect(typeof codec.decode).to.equal('function');
    expect(typeof codec.encode).to.equal('function');
  });
});
