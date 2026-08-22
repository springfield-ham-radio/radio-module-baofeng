import type { RadioCodec, RadioMemory, RadioMemoryConfig, RadioMemoryMap, RadioModelId, RadioProgram } from '@springfield/ham-radio-api';
import { BaofengDecoder } from './baofeng-decoder.js';
import { BaofengEncoder } from './baofeng-encoder.js';
import type { ILogLayer } from 'loglayer';
import uv5rSettingsMap from '../memory-maps/uv5r-settings.json' with { type: 'json' };

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
  /** Optional override; defaults to the UV-5R settings map shipped with this module. */
  memoryMap?: RadioMemoryMap;
}

export function baofengMemoryConfig(config: BaofengConfig): RadioMemoryConfig {
  return {
    chunkSize: config.memorySegmentSize,
    addressSize: 2,
    addressEndianness: 'big',
    segments: {
      channels: config.channelMemorySegment,
      settings: config.settingsMemorySegment,
    },
  };
}

export function baofengMemoryMap(config: BaofengConfig): RadioMemoryMap {
  return config.memoryMap ?? (uv5rSettingsMap as RadioMemoryMap);
}

export class BaofengCodec implements RadioCodec {
  private readonly decoder: BaofengDecoder;
  private readonly encoder: BaofengEncoder;

  constructor(radioModel: RadioModelId, config: BaofengConfig, logger: ILogLayer) {
    this.decoder = new BaofengDecoder(config, logger);
    this.encoder = new BaofengEncoder(radioModel, config, logger);
  }

  decode(memory: RadioMemory): RadioProgram {
    return this.decoder.decode(memory);
  }

  encode(program: RadioProgram, memory: RadioMemory): RadioMemory {
    return this.encoder.encode(program, memory);
  }
}
