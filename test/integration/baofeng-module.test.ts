import { Frequency, type RadioModelId, type RadioProgram, RadioToneType } from '@springfield/ham-radio-api';
import { describe, it } from 'node:test';
import { CodecFactory } from '../../src/codec-factory.js';
import { MockLogLayer } from 'loglayer';
import { expect } from 'chai';

describe('Baofeng Module Integration', () => {
  it('should encode and decode a simple channel program', async () => {
    const factory = new CodecFactory();
    const logger = new MockLogLayer();
    const modelId: RadioModelId = 'baofeng-uv5r' as RadioModelId;
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

    const originalProgram: RadioProgram = {
      channels: [
        {
          channelNumber: 0,
          radioChannel: {
            name: 'TEST',
            receiveFrequency: Frequency(146_520_000),
            receiveTone: { tone: 0, type: RadioToneType.CTCSS },
            transmitFrequency: Frequency(146_520_000),
            transmitTone: { tone: 0, type: RadioToneType.CTCSS },
          },
          settings: { transmitPower: 5 },
        },
      ],
      settings: {},
    };

    // Create a mock memory for encoding
    const mockMemory = { contents: new Uint8Array(8192), radioModel: modelId };
    const encodedMemory = codec.encode(originalProgram, mockMemory);
    const decodedProgram = codec.decode(encodedMemory);

    expect(decodedProgram.channels).to.have.length(1);
    expect(decodedProgram.channels[0].channelNumber).to.equal(0);

    // Handle the case where radioChannel can be either RadioChannel or string
    const radioChannel = decodedProgram.channels[0].radioChannel;

    if ('object' === typeof radioChannel && null !== radioChannel) {
      expect(radioChannel.name).to.equal('TEST');
      expect(radioChannel.receiveFrequency).to.equal(146_520_000);
      expect(radioChannel.transmitFrequency).to.equal(146_520_000);
    }

    expect(decodedProgram.channels[0].settings?.transmitPower).to.equal(5);
  });
});