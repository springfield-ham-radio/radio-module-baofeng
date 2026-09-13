# radio-module-baofeng

JSON radio module for Baofeng UV-5R / UV-5RE Plus. Clone-protocol memory read and write; no live CAT.

Install from HamBench (**Preferences → Radios**). This package is a JSON zip on GitHub Releases, not an npm runtime dependency of the app.

Docs: [Install radios](https://springfield-ham-radio.github.io/ham-radio-docs/guide/install-radios.html) · [Create a module](https://springfield-ham-radio.github.io/ham-radio-docs/developer/radio-module-dev.html) · [UV-5R protocol](https://springfield-ham-radio.github.io/ham-radio-docs/developer/protocols/dsl.html)

```bash
yarn pack:release
```

`pack:release` stamps `package.json`'s version into every `configs/*.json` `version` field before zipping.
