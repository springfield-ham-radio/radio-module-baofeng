import type { RadioCodec, RadioMemory, RadioModelId, RadioProgram } from '@springfield/ham-radio-api';
import { BaofengDecoder } from './baofeng-decoder.js';
import { BaofengEncoder } from './baofeng-encoder.js';
import type { ILogLayer } from 'loglayer';

export interface BaofengMemorySegmentConfig {
  startAddress: number;
  endAddress: number;
}

export interface BaofengConfig {
  channelMemorySegment: BaofengMemorySegmentConfig;
  settingsMemorySegment: BaofengMemorySegmentConfig;
  memorySegmentSize: number;
  magicNumber: number[];
  receiveFrequencyOffset: number;
  transmitFrequencyOffset: number;
  receiveToneOffset: number;
  transmitToneOffset: number;
  powerOffset: number;
  channelSize: number;
  numberChannels: number;
  radioSettingsSchemaPath: string;
  channelSettingsSchemaPath: string;
}

export class BaofengCodec implements RadioCodec {
  private decoder: BaofengDecoder;
  private encoder: BaofengEncoder;

  constructor(radioModel: RadioModelId, config: BaofengConfig, logger: ILogLayer) {
    this.decoder = new BaofengDecoder(config, logger);
    this.encoder = new BaofengEncoder(radioModel, config, logger);
  }

  decode(memory: RadioMemory): RadioProgram {
    return this.decoder.decode(memory);
  }

  encode(program: RadioProgram): RadioMemory {
    return this.encoder.encode(program);
  }
}