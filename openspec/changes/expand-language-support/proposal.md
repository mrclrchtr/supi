## Why

SuPi currently supports TypeScript/JavaScript on both the LSP and Tree-sitter layers, and Python, Rust, Go, and C/C++ on the LSP layer only. Tree-sitter structural analysis is limited to JS/TS, which means outline, query, and node-at operations fail for the majority of non-frontend codebases. Adding parity across both layers for the most common languages maximizes the value of SuPi's code intelligence stack.

## What Changes

- Add Tree-sitter grammar support for **Python**, **Rust**, **Go**, **C**, **C++**, **Java**, **Kotlin**, and **Ruby**.
- Add default LSP server entries for **Ruby** (`ruby-lsp`), **Java** (`jdtls`), and **Kotlin** (`kotlin-lsp`).
- Update `supi-tree-sitter/language.ts` to map file extensions to new grammar IDs.
- Update `supi-tree-sitter/runtime.ts` to load new grammar WASM files from npm packages.
- Update `supi-lsp/defaults.json` with new server definitions and file type mappings.
- **Unify LSP server definitions into supi config** (`~/.pi/agent/supi/config.json` and `.pi/supi/config.json`) under the `lsp.servers` key, replacing the separate `.pi-lsp.json` file. Server definitions are keyed by **language name** (e.g., `typescript`, `python`, `rust`, `c`, `cpp`, `ruby`, `java`, `kotlin`) rather than server binary name. Each entry supports per-key overrides against code defaults: any omitted field (`args`, `fileTypes`, `rootMarkers`) falls back to the built-in default for that language. `.pi-lsp.json` is no longer read.
- Add peer dependencies for all new `tree-sitter-*` npm packages.

## Capabilities

### New Capabilities
- `tree-sitter-language-expansion`: Adds grammar resolution, WASM loading, and parser management for Python, Rust, Go, C, C++, Java, Kotlin, and Ruby in the Tree-sitter extension.
- `lsp-language-expansion`: Adds default LSP server configurations for Ruby (ruby-lsp), Java (jdtls), and Kotlin (kotlin-lsp) to the LSP extension defaults.

### Modified Capabilities
- `tree-sitter-runtime`: Grammar detection and WASM path resolution will be extended to support the new language set. No behavioral changes to the runtime API.
- `lsp-config`: Default server definitions will include three new entries. Config loading will be updated to read server definitions from supi config with per-language-key override resolution, removing `.pi-lsp.json`.

## Impact

- **Packages affected**: `supi-tree-sitter`, `supi-lsp`, `supi-core`
- **Files modified**: `packages/supi-tree-sitter/language.ts`, `packages/supi-tree-sitter/runtime.ts`, `packages/supi-tree-sitter/package.json`, `packages/supi-lsp/defaults.json`, `packages/supi-lsp/config.ts`, `packages/supi-lsp/types.ts`, `packages/supi-lsp/settings-registration.ts`
- **Dependencies**: 8 new `tree-sitter-*` peer dependencies; no runtime dependency changes for LSP (servers are external binaries)
- **Breaking changes**: `.pi-lsp.json` support is removed. Server definitions must be moved to `~/.pi/agent/supi/config.json` or `.pi/supi/config.json` under the `lsp.servers` key, keyed by language name.
