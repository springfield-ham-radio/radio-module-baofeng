# radio-module-baofeng

JSON radio module for Baofeng UV-5R / UV-5RE Plus. Clone-protocol memory read and write; no live CAT.

Install from HamBench (**Preferences → Radios**). This package is a JSON zip on GitHub Releases, not an npm runtime dependency of the app.

Docs: [Install radios](https://springfield-ham-radio.github.io/ham-radio-docs/guide/install-radios.html) · [Create a module](https://springfield-ham-radio.github.io/ham-radio-docs/developer/radio-module-dev.html) · [UV-5R protocol](https://springfield-ham-radio.github.io/ham-radio-docs/developer/protocols/dsl.html)

```bash
yarn pack:release
```

`pack:release` writes the zip and `dist-release/catalog-module.json`. Each `configs/*.json` `version` stays that radio's driver version. The zip version comes from `package.json`.
