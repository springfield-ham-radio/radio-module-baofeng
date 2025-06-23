import { type CTCSS, type DCS, Frequency, type RadioChannel, type RadioMemory, type RadioProgram, type RadioProgrammedChannel, type RadioTone, RadioToneType } from "@springfield/ham-radio-api";
import type { BaofengConfig } from "./baofeng-codec.js";
import type { ILogLayer } from "loglayer";
import { dcsValues } from "./baofeng-dcs-tones.js";

export class BaofengDecoder {
  private config: BaofengConfig;
  private logger: ILogLayer;

  constructor(config: BaofengConfig, logger: ILogLayer) {
    this.config = config;
    this.logger = logger;
  }

  public decode(memory: RadioMemory): RadioProgram {
    const radioProgram: RadioProgram = {
      channels: [],
      settings: {},
    };

    for (let channelNumber = 0; channelNumber < this.config.numberChannels; channelNumber++) {
      this.logger.debug(`Decoding channel: ${channelNumber}`);

      const channelAddress = this.getChannelAddress(channelNumber);

      if (0xff != memory.contents[channelAddress]) {
        const channel = this.decodeChannel(memory, channelAddress, channelNumber);
        radioProgram.channels.push(channel);
      }
    }

    return radioProgram;
  }

  private getChannelAddress(channelNumber: number): number {
    return channelNumber * this.config.channelSize;
  }

  private decodeChannel(memory: RadioMemory, channelAddress: number, channelNumber: number): RadioProgrammedChannel {
    const transmitPower = this.decodePower(memory.contents[channelAddress + this.config.powerOffset]);

    const name = this.decodeChannelName(channelAddress, memory);
    const receiveFrequency = this.decodeFrequency(memory.contents, channelAddress, this.config.receiveFrequencyOffset);
    const transmitFrequency = this.decodeFrequency(memory.contents, channelAddress, this.config.transmitFrequencyOffset);
    const receiveTone = this.decodeTone(memory.contents, channelAddress, this.config.receiveToneOffset);
    const transmitTone = this.decodeTone(memory.contents, channelAddress, this.config.transmitToneOffset);

    const radioChannel: RadioChannel = { name, receiveFrequency, receiveTone, transmitFrequency, transmitTone };
    const radioSpecificChannelSettings = { transmitPower };
    return { channelNumber, radioChannel, settings: radioSpecificChannelSettings };
  }

  private decodePower(power: number) {
    return 0x0 == power ? 5 : 1;
  }

  private decodeChannelName(channelAddress: number, memory: RadioMemory) {
    const channelNameAddress = 0x10_00 + channelAddress;

    let channelName = "";

    for (let i = 0; 7 > i; i++) {
      const value = memory.contents[channelNameAddress + i];

      if (0xff != value) {
        channelName += String.fromCharCode(value);
      }
    }

    return channelName;
  }

  private decodeFrequency(memoryData: Uint8Array, channelOffset: number, valueOffset: number): Frequency {
    let bcd = 0;

    for (let i = 0; 4 > i; i++) {
      bcd |= memoryData[channelOffset + valueOffset + i] << (8 * i);
    }

    return Frequency(parseInt(bcd.toString(16), 10) * 10);
  }

  private decodeTone(memoryData: Uint8Array, channelOffset: number, valueOffset: number): RadioTone {
    // DCS: 1 byte index, CTCSS: 2 bytes value
    const dcsIndex = memoryData[channelOffset + valueOffset];
    const ctcssValue = (memoryData[channelOffset + valueOffset] & 0xff) | (memoryData[channelOffset + valueOffset + 1] << 8);

    // Heuristic: if the second byte is 0, treat as DCS (index), else CTCSS
    if (0 === memoryData[channelOffset + valueOffset + 1]) {
      const dcs = dcsValues[dcsIndex] ?? 0;
      return { tone: dcs as DCS, type: RadioToneType.DCS };
    } else {
      return { tone: ctcssValue as CTCSS, type: RadioToneType.CTCSS };
    }
  }
}
