# Changelog

## [1.7.0](https://github.com/mrclrchtr/supi/compare/v1.6.0...v1.7.0) (2026-05-24)


### Features

* **code-intelligence:** split code_intel into focused tools ([ebe7bdc](https://github.com/mrclrchtr/supi/commit/ebe7bdc75c8ebe4c910efc4b95ed2adafd67563f))
* **core:** add shared tool-spec/registration framework ([f624de6](https://github.com/mrclrchtr/supi/commit/f624de6d7898fa2318e56b8f3ddb5281fe202c0b))
* **supi-review:** add file overview, skip annotations, calibration, smart follow-up ([456d8f7](https://github.com/mrclrchtr/supi/commit/456d8f7b50232ecb5257aaee0fe64001e92b252f))
* **supi-review:** bump brief synthesis thinking level to xhigh ([d2e4a39](https://github.com/mrclrchtr/supi/commit/d2e4a39ab35b3c9784e4823a10b8ed445fcbe404))


### Bug Fixes

* **lsp:** add timeout guard for exit notification flush ([4dc3be8](https://github.com/mrclrchtr/supi/commit/4dc3be889b50fc9f3a6fdf55f7af8cce39dde0e9))
* **lsp:** avoid vscode-jsonrpc shutdown noise ([c37ef54](https://github.com/mrclrchtr/supi/commit/c37ef5458c3235318f50130d21b22d941d73a542))
* **test:** mock spawnSync in web.test.ts to prevent CI flake ([784967b](https://github.com/mrclrchtr/supi/commit/784967bade2cf5fcee223942101faa5bdc41a8ec))
* **test:** update pack-staged bundledDependencies assertion for vscode-* ([0982c24](https://github.com/mrclrchtr/supi/commit/0982c24cde62d712c88178bdfbce081b42d37ab4))

## [1.6.0](https://github.com/mrclrchtr/supi/compare/v1.5.0...v1.6.0) (2026-05-22)


### Features

* **supi-review:** show reviewer prompt preview in colored confirmation dialog ([d6e4edd](https://github.com/mrclrchtr/supi/commit/d6e4edd8511fd57c39670dc2cec5ffa512119c76))


### Bug Fixes

* **ci:** use GitHub App token for release-please ([4d61d69](https://github.com/mrclrchtr/supi/commit/4d61d6955077c8d64dee20a7507303b8e2e64d5d))

## [1.5.0](https://github.com/mrclrchtr/supi/compare/v1.4.0...v1.5.0) (2026-05-21)


### Features

* **supi-ask-user:** add per-option notes to choice questions ([98f81bb](https://github.com/mrclrchtr/supi/commit/98f81bb378e255d86d7c95b3d5aff38c3c3d1fae))
* **supi-ask-user:** forward Ctrl+O to PI when overlay is open ([2a071e5](https://github.com/mrclrchtr/supi/commit/2a071e583958b2105b625dee08a9b6e38a8f37a5))


### Bug Fixes

* **lsp:** use partial core API mocks in unit tests ([c8fd85a](https://github.com/mrclrchtr/supi/commit/c8fd85a50fbb7d40e15c9df6616d7ca880b365b8))
* **packaging:** bundle meta-package runtime deps ([252b83b](https://github.com/mrclrchtr/supi/commit/252b83bd87f7f5b1ab4db7fc052bfa876364f575))
* **supi-ask-user:** wrap choice descriptions across multiple lines ([6aa8305](https://github.com/mrclrchtr/supi/commit/6aa8305728172732c0ae21dcfdaee8bdbbcf0944))

## [1.4.0](https://github.com/mrclrchtr/supi/compare/v1.3.1...v1.4.0) (2026-05-21)


### Features

* **supi-claude-md:** hide improver and revision skills from auto-invocation ([a5a563d](https://github.com/mrclrchtr/supi/commit/a5a563dc921ec218406ab85cb5f1879e76915758))
* **supi-context:** add guideline source attribution and per-tool snippet breakdown ([f71e3a1](https://github.com/mrclrchtr/supi/commit/f71e3a11d9888c358de43f90dbe13ba4810ee516))
* **supi-context:** add tool definition breakdown with full mode support ([86b66f3](https://github.com/mrclrchtr/supi/commit/86b66f3a15c82c074aa0543fa53bfa733846d55a))
* **supi-context:** redesign context usage report ([2b859af](https://github.com/mrclrchtr/supi/commit/2b859aff0ab6e3c0a20858ca58c51d842815edb1))
* **supi-context:** show instruction files, guideline details, and file origins ([c5574dd](https://github.com/mrclrchtr/supi/commit/c5574ddf23fde45ecbe2bedeac4340461298654b))
* **supi-extras:** add model-effort-colors footer extension ([5f31b99](https://github.com/mrclrchtr/supi/commit/5f31b99c275ccbe964b47cbaebeb18168c3496fe))
* **supi-review:** redesign around brief-driven review pipeline ([a28cf79](https://github.com/mrclrchtr/supi/commit/a28cf7987b47986ce4cb6f6c0b90e243a2a8b2a7))


### Bug Fixes

* **lsp:** harden request handling and config scope recovery ([a26aa91](https://github.com/mrclrchtr/supi/commit/a26aa91bef7aed419acb0b52ecab2a9cdb947395))
* **lsp:** normalize session path handling ([5146b2e](https://github.com/mrclrchtr/supi/commit/5146b2e3d4caa2ecd305a8ee29eb380d7c5e0d02))
* **pi:** tighten upgrade follow-up typings ([d7d4201](https://github.com/mrclrchtr/supi/commit/d7d4201ed59ab8ba549ef967c41784a44f7affb5))
* **pi:** upgrade framework deps and restore typecheck ([983de3c](https://github.com/mrclrchtr/supi/commit/983de3cce97f29ac0cd2f2eeec9b42c12693e458))
* **supi-ask-user:** wrap note text in renderNoteStatus to prevent TUI overflow crash ([f92cc17](https://github.com/mrclrchtr/supi/commit/f92cc17de3e990ab85397d5788711c419cb924f0))

## [1.3.1](https://github.com/mrclrchtr/supi/compare/v1.3.0...v1.3.1) (2026-05-17)


### Bug Fixes

* reference bundled pi dependency extensions in pi.extensions manifests ([ced114c](https://github.com/mrclrchtr/supi/commit/ced114c24ff68ca9995828664a5d1bbf6d88a672))

## [1.3.0](https://github.com/mrclrchtr/supi/compare/v1.2.0...v1.3.0) (2026-05-17)


### Features

* adopt explicit /api and /extension package surfaces across all published packages ([dc4dedf](https://github.com/mrclrchtr/supi/commit/dc4dedf664fa31a53c15bfe6c5592bd7a3e3c448))

## [1.2.0](https://github.com/mrclrchtr/supi/compare/v1.1.3...v1.2.0) (2026-05-17)


### Features

* **supi-claude-md:** remove re-injection after x turns ([0406c8d](https://github.com/mrclrchtr/supi/commit/0406c8d888133a807e462a14ccc59cd60cfb4565))


### Bug Fixes

* mark meta-package peer dep as optional to prevent koffi build failure ([af9564b](https://github.com/mrclrchtr/supi/commit/af9564bda3e8ae9b75a93a3d9aa4bb25735c88e1))

## [1.1.3](https://github.com/mrclrchtr/supi/compare/v1.1.2...v1.1.3) (2026-05-17)


### Bug Fixes

* mark pi-provided peer deps as optional via peerDependenciesMeta ([d9565c3](https://github.com/mrclrchtr/supi/commit/d9565c3341b0e1eca6a5afc8b4569fe560946cb5))

## [1.1.2](https://github.com/mrclrchtr/supi/compare/v1.1.1...v1.1.2) (2026-05-17)


### Bug Fixes

* **ci:** expand '.' to workspace packages in publish-released ([53f8553](https://github.com/mrclrchtr/supi/commit/53f8553c192b07fc9b54ebc0864af219452ce361))
* **ci:** sort imports alphabetically in publish-released ([9992982](https://github.com/mrclrchtr/supi/commit/99929829af9ac45479a7d74e9e230e1dabd24e46))

## [1.1.1](https://github.com/mrclrchtr/supi/compare/v1.1.0...v1.1.1) (2026-05-17)


### Bug Fixes

* **ci:** skip private packages in publish-released ([96697f3](https://github.com/mrclrchtr/supi/commit/96697f3c4a7165cdc98113d7d99877f4f66a6e49))

## [1.1.0](https://github.com/mrclrchtr/supi/compare/v1.0.0...v1.1.0) (2026-05-17)


### Features

* **code-intel:** ship bundled analysis improvements ([47ed970](https://github.com/mrclrchtr/supi/commit/47ed9704bd47da62aaf00a20bc13e5e12448a074))


### Bug Fixes

* **ci:** align release-please config coverage check with single-root config ([22ce1f8](https://github.com/mrclrchtr/supi/commit/22ce1f809e27abe7778a3c43642b35657f0d4849))
* resolve pre-existing test failures in pack-staged and concurrency guard ([747b788](https://github.com/mrclrchtr/supi/commit/747b788e2a7cc8bdb4975e55b20363fbcaf6bf46))
