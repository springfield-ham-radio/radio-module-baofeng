import type { RadioMemory, RadioModelId, RadioProgram } from '@springfield/ham-radio-api';
import { encodeRadioProgram } from '@springfield/ham-radio-utils';
import type { BaofengConfig } from './baofeng-codec.js';
import { baofengMemoryConfig, baofengMemoryMap } from './baofeng-codec.js';
import type { ILogLayer } from 'loglayer';

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
   * Missing channel numbers are cleared to 0xFF (Chirp-like empty).
   */
  public encode(radioProgram: RadioProgram, existingMemory?: RadioMemory): RadioMemory {
    const totalSize = this.config.settingsMemorySegment.endAddress + 1;
    const memory = existingMemory?.contents
      ? new Uint8Array(existingMemory.contents)
      : this.createEmptyImage(totalSize);

    try {
      encodeRadioProgram(
        baofengMemoryMap(this.config),
        radioProgram,
        memory,
        baofengMemoryConfig(this.config),
      );
    } catch (error) {
      this.logger.withError(error).warn('Failed to encode radio program into memory map');
    }

    this.logger.debug(`Memory size: ${memory.length} bytes`);
    return { contents: memory, radioModel: this.radioModel };
  }

  private createEmptyImage(totalSize: number): Uint8Array {
    const memory = new Uint8Array(totalSize);

    for (let index = 0; index < totalSize; index += 1) {
      memory[index] = 0xff;
    }

    return memory;
  }
}
