## MODIFIED Requirements

### Requirement: Tree-sitter runtime SHALL support the JavaScript, TypeScript, Python, Rust, Go, C, C++, Java, Kotlin, and Ruby file families
The system SHALL recognize and parse `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, `.cjs`, `.py`, `.pyi`, `.rs`, `.go`, `.mod`, `.c`, `.h`, `.cpp`, `.hpp`, `.cc`, `.cxx`, `.hxx`, `.c++`, `.h++`, `.java`, `.kt`, `.kts`, and `.rb` files using Tree-sitter grammars configured by the extension.

#### Scenario: Supported TypeScript file
- **WHEN** a consumer requests Tree-sitter services for `packages/supi-lsp/lsp.ts`
- **THEN** the runtime detects the file as supported and creates or reuses the appropriate TypeScript parser

#### Scenario: Supported TSX file
- **WHEN** a consumer requests Tree-sitter services for `src/component.tsx`
- **THEN** the runtime detects the file as supported and uses the TSX grammar for parsing

#### Scenario: Supported JSX-family file
- **WHEN** a consumer requests Tree-sitter services for `src/component.jsx`
- **THEN** the runtime detects the file as supported and uses the JavaScript grammar family for parsing

#### Scenario: Supported Python file
- **WHEN** a consumer requests Tree-sitter services for `script.py`
- **THEN** the runtime detects the file as supported and uses the Python grammar for parsing

#### Scenario: Supported Rust file
- **WHEN** a consumer requests Tree-sitter services for `lib.rs`
- **THEN** the runtime detects the file as supported and uses the Rust grammar for parsing

#### Scenario: Supported Go file
- **WHEN** a consumer requests Tree-sitter services for `main.go`
- **THEN** the runtime detects the file as supported and uses the Go grammar for parsing

#### Scenario: Supported C file
- **WHEN** a consumer requests Tree-sitter services for `main.c`
- **THEN** the runtime detects the file as supported and uses the C grammar for parsing

#### Scenario: Supported C++ file
- **WHEN** a consumer requests Tree-sitter services for `main.cpp`
- **THEN** the runtime detects the file as supported and uses the C++ grammar for parsing

#### Scenario: Supported Java file
- **WHEN** a consumer requests Tree-sitter services for `App.java`
- **THEN** the runtime detects the file as supported and uses the Java grammar for parsing

#### Scenario: Supported Kotlin file
- **WHEN** a consumer requests Tree-sitter services for `App.kt`
- **THEN** the runtime detects the file as supported and uses the Kotlin grammar for parsing

#### Scenario: Supported Ruby file
- **WHEN** a consumer requests Tree-sitter services for `app.rb`
- **THEN** the runtime detects the file as supported and uses the Ruby grammar for parsing

### Requirement: Tree-sitter runtime SHALL use packaged WebAssembly grammars
The system SHALL use the portable WASM setup proven in commit `b48ba23e`: `web-tree-sitter` as the runtime, npm grammar packages for all supported languages, and package-relative `.wasm` asset resolution.

#### Scenario: Runtime resolves grammar assets from package metadata
- **WHEN** the first supported file is parsed for any configured language
- **THEN** the runtime locates the required grammar package with `createRequire(import.meta.url)` and `require.resolve(<grammar>/package.json)`
- **AND** loads the appropriate `.wasm` grammar asset from that installed package directory

#### Scenario: Runtime does not depend on repository-relative paths
- **WHEN** the extension is loaded through the published `@mrclrchtr/supi` wrapper or directly as `@mrclrchtr/supi-tree-sitter`
- **THEN** grammar asset loading succeeds without assuming the current working directory is the SuPi repository root
