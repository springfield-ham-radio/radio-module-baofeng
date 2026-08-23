import { Frequency, type RadioModelId, type RadioProgram, RadioToneType, type RadioMemoryConfig, type RadioMemoryMap } from '@springfield/ham-radio-api';
import { describe, it } from 'node:test';
import { createMemoryMapCodec } from '@springfield/ham-radio-utils';
import { MockLogLayer } from 'loglayer';
import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');
const memoryMap = JSON.parse(
  readFileSync(join(rootDirectory, 'src/shared/memory-maps/uv5r-settings.json'), 'utf8'),
) as RadioMemoryMap;
const radioConfig = JSON.parse(readFileSync(join(rootDirectory, 'configs/baofeng-uv5r.json'), 'utf8')) as {
  memoryConfig: RadioMemoryConfig;
};
const memoryConfig = radioConfig.memoryConfig;
const modelId: RadioModelId = 'baofeng-uv5r' as RadioModelId;

function createCodec() {
  return createMemoryMapCodec({
    radioModel: modelId,
    memoryMap,
    memoryConfig,
    logger: new MockLogLayer(),
  });
}

describe('Baofeng Module Integration', () => {
  it('should encode and decode a simple channel program', () => {
    const codec = createCodec();

    const originalProgram: RadioProgram = {
      channels: [
        {
          channelNumber: 0,
          radioChannel: {
            name: 'TEST',
            receiveFrequency: Frequency(146_520_000),
            receiveTone: { tone: 885, type: RadioToneType.CTCSS },
            transmitFrequency: Frequency(146_520_000),
            transmitTone: { tone: 23, type: RadioToneType.DCS },
          },
          settings: {
            transmitPower: 5,
            mode: 'FM',
            skip: '',
            bcl: false,
            scode: 0,
            pttid: 'Off',
          },
        },
      ],
      settings: {},
    };

    const mockMemory = { contents: new Uint8Array(8192).fill(0xff), radioModel: modelId };
    const encodedMemory = codec.encode(originalProgram, mockMemory);
    const decodedProgram = codec.decode(encodedMemory);

    expect(decodedProgram.channels).to.have.length(1);
    expect(decodedProgram.channels[0].channelNumber).to.equal(0);

    const radioChannel = decodedProgram.channels[0].radioChannel;

    if (typeof radioChannel === 'object' && radioChannel !== undefined) {
      expect(radioChannel.name).to.equal('TEST');
      expect(radioChannel.receiveFrequency).to.equal(146_520_000);
      expect(radioChannel.transmitFrequency).to.equal(146_520_000);
      expect(radioChannel.receiveTone).to.deep.equal({ tone: 885, type: RadioToneType.CTCSS });
      expect(radioChannel.transmitTone).to.deep.equal({ tone: 23, type: RadioToneType.DCS });
    }

    expect(decodedProgram.channels[0].settings?.transmitPower).to.equal(5);
    expect(decodedProgram.channels[0].settings?.mode).to.equal('FM');
    expect(decodedProgram.channels[0].settings?.skip).to.equal('');
  });

  it('should clear omitted channels to 0xFF', () => {
    const codec = createCodec();

    const contents = new Uint8Array(8192).fill(0xff);
    let word = Number.parseInt((146_520_000 / 10).toString(10), 16);
    for (let index = 0; index < 4; index += 1) {
      contents[16 + index] = word & 0xff;
      word >>= 8;
    }

    const encoded = codec.encode({ channels: [], settings: {} }, { contents, radioModel: modelId });
    expect(encoded.contents[16]).to.equal(0xff);
  });

  it('should decode and encode radio-wide settings via the memory map', () => {
    const codec = createCodec();
    const contents = new Uint8Array(8192).fill(0xff);
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
