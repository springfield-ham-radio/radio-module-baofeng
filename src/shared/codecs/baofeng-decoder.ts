import {
  type CTCSS,
  type DCS,
  Frequency,
  type RadioChannel,
  type RadioMemory,
  type RadioProgram,
  type RadioProgrammedChannel,
  type RadioTone,
  RadioToneType,
} from '@springfield/ham-radio-api';
import { decodeMemoryMap } from '@springfield/ham-radio-utils';
import type { BaofengConfig } from './baofeng-codec.js';
import { baofengMemoryConfig, baofengMemoryMap } from './baofeng-codec.js';
import type { ILogLayer } from 'loglayer';
import { dcsValues } from './baofeng-dcs-tones.js';

export class BaofengDecoder {
  private readonly config: BaofengConfig;
  private readonly logger: ILogLayer;

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

      if (memory.contents[channelAddress] !== 0xff) {
        const channel = this.decodeChannel(memory, channelAddress, channelNumber);
        radioProgram.channels.push(channel);
      }
    }

    try {
      radioProgram.settings = decodeMemoryMap(
        baofengMemoryMap(this.config),
        memory.contents,
        baofengMemoryConfig(this.config),
      );
    } catch (error) {
      this.logger.withError(error).warn('Failed to decode radio settings from memory map');
      radioProgram.settings = {};
    }

    return radioProgram;
  }

  private getChannelAddress(channelNumber: number): number {
    return channelNumber * this.config.channelSize;
  }

  private decodeChannel(memory: RadioMemory, channelAddress: number, channelNumber: number): RadioProgrammedChannel {
    const transmitPower = this.decodePower(memory.contents[channelAddress + this.config.powerOffset]);

    const name = this.decodeChannelName(channelNumber, memory);
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

  private decodeChannelName(channelNumber: number, memory: RadioMemory): string {
    const channelNameAddress = 0x1000 + channelNumber * 0x10;

    let channelName = '';

    for (let index = 0; index < 7; index += 1) {
      const value = memory.contents[channelNameAddress + index];

      if (value !== 0xff && value !== 0x00) {
        channelName += String.fromCodePoint(value);
      }
    }

    return channelName.trim();
  }

  private decodeFrequency(memoryData: Uint8Array, channelOffset: number, valueOffset: number): Frequency {
    let value = 0;

    for (let index = 0; index < 4; index += 1) {
      value |= memoryData[channelOffset + valueOffset + index] << (8 * index);
    }

    return Frequency(Number.parseInt(value.toString(16), 10) * 10);
  }

  private decodeTone(memoryData: Uint8Array, channelOffset: number, valueOffset: number): RadioTone {
    const dcsIndex = memoryData[channelOffset + valueOffset];
    const ctcssValue = (memoryData[channelOffset + valueOffset] & 0xff) | (memoryData[channelOffset + valueOffset + 1] << 8);

    if (memoryData[channelOffset + valueOffset + 1] === 0) {
      const dcs = dcsValues[dcsIndex] ?? 0;
      return { tone: dcs as DCS, type: RadioToneType.DCS };
    }

    return { tone: ctcssValue as CTCSS, type: RadioToneType.CTCSS };
  }
}
