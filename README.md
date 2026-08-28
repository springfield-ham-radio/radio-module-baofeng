# radio-module-baofeng

A radio module for Baofeng UV-5R series ham radios, compatible with the Springfield Ham Radio Registry.

## Description

This module provides support for programming and managing Baofeng UV-5R and UV-5RE Plus ham radios. It includes:

- Memory read/write capabilities
- Channel programming with CTCSS/DCS tones
- Radio settings configuration
- Complete protocol implementation for the UV-5R series

## Features

- **Memory Management**: Read and write radio memory segments
- **Channel Programming**: Program up to 128 channels with frequencies, tones, and power settings
- **Tone Support**: Full CTCSS and DCS tone encoding/decoding
- **Settings Configuration**: Configure radio settings like squelch, step size, and scan modes
- **Protocol Support**: Complete implementation of the Baofeng UV-5R communication protocol

## Installation

### Desktop app

Install from **Preferences → Radios** (or the first-launch Install radios dialog). The app downloads the JSON-only zip from GitHub Releases listed in the official catalog.

### Release zip

Each GitHub Release attaches `radio-module-baofeng-<version>.zip` (configs + shared schemas/memory maps). Build it locally with:

```bash
yarn pack:release
```

Update the official `radio-module-catalog` with the printed `sha256:…` integrity after release.

## Usage

### Basic Usage

Radio modules are JSON. Load the config (and resolve `$ref`s), then use the generic memory-map codec:

```typescript
import { createMemoryMapCodec } from '@springfield/ham-radio-utils';
import { MockLogLayer } from 'loglayer';
import config from '@springfield/radio-module-baofeng/configs/baofeng-uv5r.json';
import memoryMap from './src/shared/memory-maps/uv5r-settings.json';

const logger = new MockLogLayer();
const codec = createMemoryMapCodec({
  radioModel: config.id.model,
  memoryMap,
  memoryConfig: config.memoryConfig,
  logger,
});

const memory = codec.encode(program, { contents: new Uint8Array(8192).fill(0xff), radioModel: config.id.model });
const decodedProgram = codec.decode(memory);
```

### Configuration

The module uses the configuration from `configs/baofeng-uv5r.json` which includes:

- Serial communication settings (9600 baud, 8N1)
- Memory layout and segment definitions
- Protocol commands for read/write operations
- Codec configuration with memory offsets

## Supported Radios

- Baofeng UV-5R
- Baofeng UV-5RE Plus

## Development

### Prerequisites

- Node.js 18+
- Yarn package manager

### Setup

```bash
yarn install
```

### Testing

```bash
# Run unit tests
yarn test

# Run integration tests
yarn test:integration
```

### Building

```bash
yarn build
```

## Module Structure

```
radio-module-baofeng/
├── configs/                    # Radio configuration files (Protocol DSL)
│   └── baofeng-uv5r.json      # UV-5R configuration
├── src/shared/                 # Shared JSON assets
│   ├── schemas/               # JSON schemas
│   │   ├── channel-schema.json
│   │   └── settings-schema.json
│   └── memory-maps/           # Memory-Map DSL
│       └── uv5r-settings.json
├── test/                       # Tests (use MemoryMapRadioCodec from ham-radio-utils)
│   ├── unit/
│   └── integration/
└── package.json
```

Encode/decode uses the generic `MemoryMapRadioCodec` from `@springfield/ham-radio-utils`. This package ships **JSON only** — no radio-specific TypeScript.

## Protocol Details

The module implements the Baofeng UV-5R communication protocol:

- **Magic Number**: `[80, 187, 255, 32, 18, 7, 37]`
- **Baud Rate**: 9600
- **Data Format**: 8 data bits, 1 stop bit, no parity
- **Memory Segments**: 
  - Channels: 0x0000 - 0x17FF (6144 bytes)
  - Settings: 0x1EC0 - 0x1FFF (320 bytes)
- **Read**: 64-byte `S` blocks after ident handshake
- **Write**: ident handshake, then 16-byte `X` blocks with a 50ms pause; skips radio addresses `0x0CF0–0x0CFF` and `0x0DF0–0x0DFF`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## Support

For issues and questions:
- Create an issue in the [GitHub repository](https://github.com/springfield-ham-radio/radio-module-baofeng)
- Check the [Springfield Ham Radio documentation](https://springfield-ham-radio.com)

## License

MIT License - see LICENSE file for details.
