# Changelog

## [2.0.0](https://github.com/mrclrchtr/supi/compare/supi-tree-sitter-v1.0.0...supi-tree-sitter-v2.0.0) (2026-05-16)


### ⚠ BREAKING CHANGES

* **lsp,tree-sitter:** .pi-lsp.json is no longer read. Server definitions must move to ~/.pi/agent/supi/config.json or .pi/supi/config.json under lsp.servers, keyed by language name (e.g. typescript, python, rust). The settings allowlist key changed from servers to active.

### Features

* **lsp,tree-sitter:** add bash, HTML, SQL, and R language support ([83bb0b7](https://github.com/mrclrchtr/supi/commit/83bb0b7d56fac6b359c7387d1f775dc95e740e91))
* **lsp,tree-sitter:** expand language support and unify LSP config ([6f88685](https://github.com/mrclrchtr/supi/commit/6f886853c499d0f72129ae662906cfd43a50653e))
* **lsp,tree-sitter:** stabilize code-intelligence substrates ([7584cb4](https://github.com/mrclrchtr/supi/commit/7584cb4b7c931830578af72742737b86a2b69617))
* **supi-tree-sitter, supi-code-intelligence:** cross-language structural callee support ([801e22e](https://github.com/mrclrchtr/supi/commit/801e22ecfa0d7baa5e22b0d5dcbb3bc78d0ecb83))
* **tree-sitter:** add structural analysis extension ([4931859](https://github.com/mrclrchtr/supi/commit/49318592a3a0d7160b1850eb81d88c97e30f4f76))


### Bug Fixes

* include src dirs in all __tests__/tsconfig.json for LSP import resolution ([d65eb8b](https://github.com/mrclrchtr/supi/commit/d65eb8be3bb2bc3da54496d73065e4243b1461fa))
* **lsp,tree-sitter:** use StringEnum for Google API compat; persist LSP state across /tree; remove dead skills entry; drop unused _cwd params ([8843a8d](https://github.com/mrclrchtr/supi/commit/8843a8d96fa2dc5867954c6b858b38bd03b01593))
* **packages:** add package entrypoints ([65e8e88](https://github.com/mrclrchtr/supi/commit/65e8e8881eca4e106e9adb43bde506a2f291eca1))
* **release:** align package surfaces and README claims ([ec20cbe](https://github.com/mrclrchtr/supi/commit/ec20cbeaf621c501c702374235f63db1e968d3dd))
* **snyk:** resolve 20 SAST findings (ReDoS, XSS, Path Traversal) ([5802df1](https://github.com/mrclrchtr/supi/commit/5802df132556cfbab870e3581595bbd0df9beca3))
* **supi-context:** guard estimate functions against null content ([0877bc3](https://github.com/mrclrchtr/supi/commit/0877bc39f2404e88460ef17ee6e9757a6c344bc2))
* **tree-sitter:** handle edge-case queries and structures ([714494b](https://github.com/mrclrchtr/supi/commit/714494b874895991bc2492ac819f8157415141ed))
* **tree-sitter:** handle scoped exports and CRLF positions ([1217eac](https://github.com/mrclrchtr/supi/commit/1217eaca0138e68f34c27e793046da3ef7d05afc))


### Performance Improvements

* **supi-tree-sitter:** vendor all grammar WASM, drop native deps from runtime bundle ([8d44234](https://github.com/mrclrchtr/supi/commit/8d44234fd70f0cd626c9d1bd74af894914b72f4f))

## [1.0.0](https://github.com/mrclrchtr/supi/compare/supi-tree-sitter-v0.1.0...supi-tree-sitter-v1.0.0) (2026-05-14)


### ⚠ BREAKING CHANGES

* **lsp,tree-sitter:** .pi-lsp.json is no longer read. Server definitions must move to ~/.pi/agent/supi/config.json or .pi/supi/config.json under lsp.servers, keyed by language name (e.g. typescript, python, rust). The settings allowlist key changed from servers to active.

### Features

* **lsp,tree-sitter:** add bash, HTML, SQL, and R language support ([83bb0b7](https://github.com/mrclrchtr/supi/commit/83bb0b7d56fac6b359c7387d1f775dc95e740e91))
* **lsp,tree-sitter:** expand language support and unify LSP config ([6f88685](https://github.com/mrclrchtr/supi/commit/6f886853c499d0f72129ae662906cfd43a50653e))
* **lsp,tree-sitter:** stabilize code-intelligence substrates ([7584cb4](https://github.com/mrclrchtr/supi/commit/7584cb4b7c931830578af72742737b86a2b69617))
* **supi-tree-sitter, supi-code-intelligence:** cross-language structural callee support ([801e22e](https://github.com/mrclrchtr/supi/commit/801e22ecfa0d7baa5e22b0d5dcbb3bc78d0ecb83))
* **tree-sitter:** add structural analysis extension ([4931859](https://github.com/mrclrchtr/supi/commit/49318592a3a0d7160b1850eb81d88c97e30f4f76))


### Bug Fixes

* include src dirs in all __tests__/tsconfig.json for LSP import resolution ([d65eb8b](https://github.com/mrclrchtr/supi/commit/d65eb8be3bb2bc3da54496d73065e4243b1461fa))
* **lsp,tree-sitter:** use StringEnum for Google API compat; persist LSP state across /tree; remove dead skills entry; drop unused _cwd params ([8843a8d](https://github.com/mrclrchtr/supi/commit/8843a8d96fa2dc5867954c6b858b38bd03b01593))
* **packages:** add package entrypoints ([65e8e88](https://github.com/mrclrchtr/supi/commit/65e8e8881eca4e106e9adb43bde506a2f291eca1))
* **release:** align package surfaces and README claims ([ec20cbe](https://github.com/mrclrchtr/supi/commit/ec20cbeaf621c501c702374235f63db1e968d3dd))
* **supi-context:** guard estimate functions against null content ([0877bc3](https://github.com/mrclrchtr/supi/commit/0877bc39f2404e88460ef17ee6e9757a6c344bc2))
* **tree-sitter:** handle edge-case queries and structures ([714494b](https://github.com/mrclrchtr/supi/commit/714494b874895991bc2492ac819f8157415141ed))
* **tree-sitter:** handle scoped exports and CRLF positions ([1217eac](https://github.com/mrclrchtr/supi/commit/1217eaca0138e68f34c27e793046da3ef7d05afc))


### Performance Improvements

* **supi-tree-sitter:** vendor all grammar WASM, drop native deps from runtime bundle ([8d44234](https://github.com/mrclrchtr/supi/commit/8d44234fd70f0cd626c9d1bd74af894914b72f4f))
