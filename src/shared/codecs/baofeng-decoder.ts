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

    for (let channelNumber = 0; channelNumber < this.config.numberChannels; channelNumber += 1) {
      this.logger.debug(`Decoding channel: ${channelNumber}`);

      const channelAddress = this.getChannelAddress(channelNumber);

      if (memory.contents[channelAddress] !== 0xFF) {
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

  private decodePower(power: number): number {
    return power === 0x0 ? 5 : 1;
  }

  private decodeChannelName(channelAddress: number, memory: RadioMemory): string {
    const channelNameAddress = 0x10_00 + channelAddress;

    let channelName = "";

    for (let index = 0; index < 8; index += 1) {
      const value = memory.contents[channelNameAddress + index];

      if (value !== 0xFF) {
        channelName += String.fromCodePoint(value);
      }
    }

    return channelName;
  }

  private decodeFrequency(memoryData: Uint8Array, channelOffset: number, valueOffset: number): Frequency {
    let value = 0;

    for (let index = 0; index < 4; index += 1) {
      value |= memoryData[channelOffset + valueOffset + index] << (8 * index);
    }

    return Frequency(Number.parseInt(value.toString(16), 10) * 10);
  }

  private decodeTone(memoryData: Uint8Array, channelOffset: number, valueOffset: number): RadioTone {
    // DCS: 1 byte index, CTCSS: 2 bytes value
    const dcsIndex = memoryData[channelOffset + valueOffset];
    const ctcssValue = (memoryData[channelOffset + valueOffset] & 0xFF) | (memoryData[channelOffset + valueOffset + 1] << 8);

    // Heuristic: if the second byte is 0, treat as DCS (index), else CTCSS
    if (memoryData[channelOffset + valueOffset + 1] === 0) {
      const dcs = dcsValues[dcsIndex] ?? 0;
      return { tone: dcs as DCS, type: RadioToneType.DCS };
    }

    return { tone: ctcssValue as CTCSS, type: RadioToneType.CTCSS };
  }
}
