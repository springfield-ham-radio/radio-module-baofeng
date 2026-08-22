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

    // Create a mock memory for encoding (0xFF = empty channel / erased EEPROM)
    const mockMemory = { contents: new Uint8Array(8192).fill(0xff), radioModel: modelId };
    const encodedMemory = codec.encode(originalProgram, mockMemory);
    const decodedProgram = codec.decode(encodedMemory);

    expect(decodedProgram.channels).to.have.length(1);
    expect(decodedProgram.channels[0].channelNumber).to.equal(0);

    // Handle the case where radioChannel can be either RadioChannel or string
    const radioChannel = decodedProgram.channels[0].radioChannel;

    if (typeof radioChannel === 'object' && radioChannel !== undefined) {
      expect(radioChannel.name).to.equal('TEST');
      expect(radioChannel.receiveFrequency).to.equal(146_520_000);
      expect(radioChannel.transmitFrequency).to.equal(146_520_000);
    }

    expect(decodedProgram.channels[0].settings?.transmitPower).to.equal(5);
  });

  it('should decode and encode radio-wide settings via the memory map', async () => {
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
    const contents = new Uint8Array(8192).fill(0xff);
    // settings seek 0x0E20: squelch, step, unknown1, save, vox, unknown2, abr, tdr
    contents[0x0e20] = 5;
    contents[0x0e23] = 2;
    contents[0x0e27] = 1;

    const decoded = codec.decode({ contents, radioModel: modelId });
    expect((decoded.settings.settings as { squelch: number }).squelch).to.equal(5);
    expect((decoded.settings.settings as { save: string }).save).to.equal('1:2');
    expect((decoded.settings.settings as { tdr: boolean }).tdr).to.equal(true);

    (decoded.settings.settings as { squelch: number }).squelch = 7;
    const encoded = codec.encode(decoded, { contents, radioModel: modelId });
    expect(encoded.contents[0x0e20]).to.equal(7);
    expect(encoded.contents[0x0e23]).to.equal(2);
    expect(encoded.contents[0x0e27]).to.equal(1);
  });
});
