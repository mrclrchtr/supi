# Changelog

## [1.1.0](https://github.com/mrclrchtr/supi/compare/supi-rtk-v1.0.0...supi-rtk-v1.1.0) (2026-05-16)


### Features

* **debug:** add shared SuPi debug registry and supi-debug extension ([c51f20e](https://github.com/mrclrchtr/supi/commit/c51f20e98d89fa54a751f8603136757d336fdb6a))
* **rtk:** add promptGuidelines for test runner verbosity control ([eaf623c](https://github.com/mrclrchtr/supi/commit/eaf623cfecda16b83f77b9a19c0efcab5a0058f8))
* **rtk:** implement RTK bash command rewriting with token savings tracking ([72c1a89](https://github.com/mrclrchtr/supi/commit/72c1a89a5ffee5cae9277a372840a4fe54d05fdb))


### Bug Fixes

* include src dirs in all __tests__/tsconfig.json for LSP import resolution ([d65eb8b](https://github.com/mrclrchtr/supi/commit/d65eb8be3bb2bc3da54496d73065e4243b1461fa))
* **packages:** add bundledDependencies per pi packages.md conventions ([de7e7a0](https://github.com/mrclrchtr/supi/commit/de7e7a0ef4b14a77e464627e4f4d58283dd74da6))
* **packages:** add package entrypoints ([65e8e88](https://github.com/mrclrchtr/supi/commit/65e8e8881eca4e106e9adb43bde506a2f291eca1))
* **rtk,lsp,review,ci:** merge best review follow-ups ([c84e883](https://github.com/mrclrchtr/supi/commit/c84e8837b8f7d755209f34d0913a34450378e05b))
* **rtk:** consolidate rewrite flow and warn once when rtk missing ([192671c](https://github.com/mrclrchtr/supi/commit/192671cec268afeae18c072908c7b1f23a5af0d2))
* **rtk:** guard all biome invocations from RTK rewrite, including cd-prefixed commands ([09ce6d5](https://github.com/mrclrchtr/supi/commit/09ce6d5129bcb51a8aaf2a7d7be7fc13cefc4099))
* **rtk:** guard Biome rewrite collisions ([5d3dbd0](https://github.com/mrclrchtr/supi/commit/5d3dbd0e8e559f9a8743b9333855da9ad28054d2))
* **rtk:** strip shell commandPrefix before RTK rewrite ([d0f0c0a](https://github.com/mrclrchtr/supi/commit/d0f0c0a654beecc359adadba45279b7a000696c4))
* **supi-rtk:** guard ripgrep commands from lossy RTK rewrite ([0112722](https://github.com/mrclrchtr/supi/commit/01127220a61c24656534428564642980c6c3bd66))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @mrclrchtr/supi-core bumped to 1.1.0

## [0.2.0](https://github.com/mrclrchtr/supi/compare/supi-rtk-v0.1.0...supi-rtk-v0.2.0) (2026-05-14)


### Features

* **debug:** add shared SuPi debug registry and supi-debug extension ([c51f20e](https://github.com/mrclrchtr/supi/commit/c51f20e98d89fa54a751f8603136757d336fdb6a))
* **rtk:** add promptGuidelines for test runner verbosity control ([eaf623c](https://github.com/mrclrchtr/supi/commit/eaf623cfecda16b83f77b9a19c0efcab5a0058f8))
* **rtk:** implement RTK bash command rewriting with token savings tracking ([72c1a89](https://github.com/mrclrchtr/supi/commit/72c1a89a5ffee5cae9277a372840a4fe54d05fdb))


### Bug Fixes

* include src dirs in all __tests__/tsconfig.json for LSP import resolution ([d65eb8b](https://github.com/mrclrchtr/supi/commit/d65eb8be3bb2bc3da54496d73065e4243b1461fa))
* **packages:** add bundledDependencies per pi packages.md conventions ([de7e7a0](https://github.com/mrclrchtr/supi/commit/de7e7a0ef4b14a77e464627e4f4d58283dd74da6))
* **packages:** add package entrypoints ([65e8e88](https://github.com/mrclrchtr/supi/commit/65e8e8881eca4e106e9adb43bde506a2f291eca1))
* **rtk,lsp,review,ci:** merge best review follow-ups ([c84e883](https://github.com/mrclrchtr/supi/commit/c84e8837b8f7d755209f34d0913a34450378e05b))
* **rtk:** consolidate rewrite flow and warn once when rtk missing ([192671c](https://github.com/mrclrchtr/supi/commit/192671cec268afeae18c072908c7b1f23a5af0d2))
* **rtk:** guard all biome invocations from RTK rewrite, including cd-prefixed commands ([09ce6d5](https://github.com/mrclrchtr/supi/commit/09ce6d5129bcb51a8aaf2a7d7be7fc13cefc4099))
* **rtk:** guard Biome rewrite collisions ([5d3dbd0](https://github.com/mrclrchtr/supi/commit/5d3dbd0e8e559f9a8743b9333855da9ad28054d2))
* **rtk:** strip shell commandPrefix before RTK rewrite ([d0f0c0a](https://github.com/mrclrchtr/supi/commit/d0f0c0a654beecc359adadba45279b7a000696c4))
* **supi-rtk:** guard ripgrep commands from lossy RTK rewrite ([0112722](https://github.com/mrclrchtr/supi/commit/01127220a61c24656534428564642980c6c3bd66))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @mrclrchtr/supi-core bumped to 0.2.0
