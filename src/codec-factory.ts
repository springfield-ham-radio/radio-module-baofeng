import { BaofengCodec, type BaofengConfig } from './shared/codecs/baofeng-codec.js';
import type { CodecFactory, RadioCodec, RadioModelId } from '@springfield/ham-radio-api';
import type { ILogLayer } from 'loglayer';

export class BaofengCodecFactory implements CodecFactory {
  async createCodec(modelId: RadioModelId, config: { [key: string]: unknown }, logger: ILogLayer): Promise<RadioCodec> {
    const baofengConfig = config as unknown as BaofengConfig;
    return new BaofengCodec(modelId, baofengConfig, logger);
  }
}

export { BaofengCodecFactory as CodecFactory };
