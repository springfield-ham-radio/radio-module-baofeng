import {
  type DCS,
  type RadioChannel,
  type RadioMemory,
  type RadioModelId,
  type RadioProgram,
  type RadioProgrammedChannel,
  type RadioTone,
  RadioToneType,
} from '@springfield/ham-radio-api';
import { encodeMemoryMap, formatChannel } from '@springfield/ham-radio-utils';
import type { BaofengConfig } from './baofeng-codec.js';
import { baofengMemoryConfig, baofengMemoryMap } from './baofeng-codec.js';
import type { ILogLayer } from 'loglayer';
import { valuesByDcs } from './baofeng-dcs-tones.js';

export class BaofengEncoder {
  private readonly radioModel: RadioModelId;
  private readonly config: BaofengConfig;
  private readonly logger: ILogLayer;

  constructor(radioModel: RadioModelId, config: BaofengConfig, logger: ILogLayer) {
    this.radioModel = radioModel;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Encode a program into memory.
   * When `existingMemory` is provided, channels and settings are patched in place
   * so unread regions (and decoded settings) are preserved.
   */
  public encode(radioProgram: RadioProgram, existingMemory?: RadioMemory): RadioMemory {
    const totalSize = this.config.settingsMemorySegment.endAddress + 1;
    const memory = existingMemory?.contents
      ? new Uint8Array(existingMemory.contents)
      : this.createEmptyImage(totalSize);

    for (const channel of radioProgram.channels.sort((channel1, channel2) => channel1.channelNumber - channel2.channelNumber)) {
      const channelAddress = this.getChannelAddress(channel.channelNumber);
      const encodedChannel = this.encodeChannel(channel);
      this.logger.debug(`Encoded channel ${formatChannel(channel.channelNumber, encodedChannel)}`);

      this.addData(memory, encodedChannel, channelAddress);

      const radioChannel: RadioChannel = channel.radioChannel as RadioChannel;

      if (radioChannel.name) {
        const encodedChannelName = this.encodeChannelName(radioChannel.name);
        const nameSegmentAddress = 0x10_00 + channel.channelNumber * this.config.channelSize;
        this.addData(memory, encodedChannelName, nameSegmentAddress);
      }
    }

    if (radioProgram.settings && Object.keys(radioProgram.settings).length > 0) {
      try {
        encodeMemoryMap(baofengMemoryMap(this.config), radioProgram.settings, memory, baofengMemoryConfig(this.config));
      } catch (error) {
        this.logger.withError(error).warn('Failed to encode radio settings into memory map');
      }
    }

    this.debugMemory(memory);
    return { contents: memory, radioModel: this.radioModel };
  }

  private createEmptyImage(totalSize: number): Uint8Array {
    const memory = new Uint8Array(totalSize);

    for (let index = 0; index < totalSize; index += 1) {
      memory[index] = 0xff;
    }

    return memory;
  }

  private getChannelAddress(channelNumber: number): number {
    return channelNumber * this.config.channelSize;
  }

  private encodeChannel(programmedChannel: RadioProgrammedChannel): Uint8Array {
    const data: Uint8Array = new Uint8Array(this.config.channelSize);

    data[this.config.powerOffset] = this.encodePower(programmedChannel.settings?.transmitPower as number);

    if (typeof programmedChannel.channelNumber === 'string') {
      throw new TypeError('Channel references are not supported yet');
    }

    const channel: RadioChannel = programmedChannel.radioChannel as RadioChannel;

    const encodedReceiveFrequency = this.encodeFrequency(channel.receiveFrequency);
    this.addData(data, encodedReceiveFrequency, this.config.receiveFrequencyOffset);

    const encodedTransmitFrequency = this.encodeFrequency(channel.transmitFrequency);
    this.addData(data, encodedTransmitFrequency, this.config.transmitFrequencyOffset);

    const encodedReceiveTone = this.encodeTone(channel.receiveTone);
    this.addData(data, encodedReceiveTone, this.config.receiveToneOffset);

    const encodedTransmitTone = this.encodeTone(channel.transmitTone);
    this.addData(data, encodedTransmitTone, this.config.transmitToneOffset);
    return data;
  }

  private addData(memory: Uint8Array, data: Uint8Array, offset: number): void {
    for (let index = 0; index < data.length; index += 1) {
      memory[offset + index] = data[index];
    }
  }

  private encodeChannelName(channelName: string): Uint8Array {
    let index = 0;
    const data = new Uint8Array(7);

    for (index = 0; index < channelName.length; index += 1) {
      data[index] = channelName.codePointAt(index) ?? 0;
    }

    for (let paddingIndex = index; paddingIndex < 8; paddingIndex += 1) {
      data[paddingIndex] = 0xff;
    }

    return data;
  }

  private encodePower(power: number): number {
    return power === 5 ? 0x0 : 0x1;
  }

  private encodeFrequency(frequency: number): Uint8Array {
    const data = new Uint8Array(4);

    const eightDigitFrequency = frequency / 10;
    let value = Number.parseInt(eightDigitFrequency.toString(10), 16);

    for (let index = 0; index < 4; index += 1) {
      data[index] = value & 0xff;
      value >>= 8;
    }

    return data;
  }

  private encodeTone(tone: RadioTone): Uint8Array {
    if (tone.type === RadioToneType.DCS) {
      const dcsIndex = valuesByDcs.get(tone.tone as unknown as DCS);

      if (dcsIndex === undefined) {
        throw new Error(`Could not encode DCS tone '${tone.tone}'`);
      }

      const data = new Uint8Array(2);
      data[0] = dcsIndex;
      data[1] = 0;
      return data;
    }

    const value = tone.tone * 10;
    const data = new Uint8Array(2);
    data[0] = value & 0xff;
    data[1] = (value >> 8) & 0xff;
    return data;
  }

  private debugMemory(memory: Uint8Array): void {
    this.logger.debug(`Memory size: ${memory.length} bytes`);
  }
}
