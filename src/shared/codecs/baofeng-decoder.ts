import type { RadioMemory, RadioProgram } from '@springfield/ham-radio-api';
import { decodeRadioProgram } from '@springfield/ham-radio-utils';
import type { BaofengConfig } from './baofeng-codec.js';
import { baofengMemoryConfig, baofengMemoryMap } from './baofeng-codec.js';
import type { ILogLayer } from 'loglayer';

export class BaofengDecoder {
  private readonly config: BaofengConfig;
  private readonly logger: ILogLayer;

  constructor(config: BaofengConfig, logger: ILogLayer) {
    this.config = config;
    this.logger = logger;
  }

  public decode(memory: RadioMemory): RadioProgram {
    try {
      return decodeRadioProgram(
        baofengMemoryMap(this.config),
        memory.contents,
        baofengMemoryConfig(this.config),
      );
    } catch (error) {
      this.logger.withError(error).warn('Failed to decode radio program from memory map');
      return { channels: [], settings: {} };
    }
  }
}
