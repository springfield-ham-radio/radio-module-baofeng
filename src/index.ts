export { CodecFactory } from './codec-factory.js';
export { BaofengCodec, type BaofengConfig } from './shared/codecs/baofeng-codec.js';
export { BaofengDecoder } from './shared/codecs/baofeng-decoder.js';
export { BaofengEncoder } from './shared/codecs/baofeng-encoder.js';

// Export information about all supported radio models
export const supportedModels = [
  {
    modelId: 'baofeng-uv5r',
    name: 'Baofeng UV-5R',
    configPath: './configs/baofeng-uv5r.json'
  },
  {
    modelId: 'baofeng-uv5r-plus',
    name: 'Baofeng UV-5R Plus',
    configPath: './configs/baofeng-uv5r.json'
  }
];
