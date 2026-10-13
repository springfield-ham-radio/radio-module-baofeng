# radio-module-baofeng

JSON radio module for Baofeng UV-5R / UV-5RE Plus. Clone-protocol memory read and write; no live CAT.

Install from HamBench (**Preferences → Radios**). Each radio is its own release zip on GitHub Releases, not an npm runtime dependency of the app.

Docs: [Install radios](https://springfield-ham-radio.github.io/ham-radio-docs/guide/install-radios.html) · [Create a module](https://springfield-ham-radio.github.io/ham-radio-docs/developer/radio-module-dev.html) · [UV-5R protocol](https://springfield-ham-radio.github.io/ham-radio-docs/developer/protocols/dsl.html)

```bash
yarn pack:release
```

`pack:release` writes one zip per changed `configs/*.json` driver:

- `dist-release/radio-module-baofeng-uv5r-<config.version>.zip` (for example `radio-module-baofeng-uv5r-3.7.0.zip`)
- `dist-release/catalog-entries.json` — schema version 3 catalog rows for those zips

Each zip contains only that config file and the relative `$ref` files it needs (schemas and memory maps). The zip filename and catalog `version` use the config’s `version` field ([ADR 0006](https://springfield-ham-radio.github.io/ham-radio-docs/developer/adr/0006-per-driver-config-semver.html)). The GitHub Release tag is still the manufacturer repo version from `package.json` / semantic-release; `downloadUrl` points at `.../releases/download/v<repo-version>/radio-module-<model>-<config.version>.zip`.

Every config must set top-level `minApiVersion` (currently `18.0.1`). semantic-release uploads only `dist-release/radio-module-*.zip` files produced for configs whose driver version increased since the last published asset for that model.

Set `PACK_RELEASE_ALL=1` to force every config into the output (local testing).

## License

MIT / Bryan Hunt
