## ADDED Requirements

### Requirement: Tree-sitter extension SHALL support Python files
The system SHALL recognize `.py` and `.pyi` files and map them to the `python` grammar ID, resolving the WASM from the `tree-sitter-python` package.

#### Scenario: Python file detection
- **WHEN** a consumer requests Tree-sitter services for `src/main.py`
- **THEN** the runtime detects the file as supported and uses the Python grammar for parsing

#### Scenario: Python stub file detection
- **WHEN** a consumer requests Tree-sitter services for `src/types.pyi`
- **THEN** the runtime detects the file as supported and uses the Python grammar for parsing

### Requirement: Tree-sitter extension SHALL support Rust files
The system SHALL recognize `.rs` files and map them to the `rust` grammar ID, resolving the WASM from the `tree-sitter-rust` package.

#### Scenario: Rust file detection
- **WHEN** a consumer requests Tree-sitter services for `src/lib.rs`
- **THEN** the runtime detects the file as supported and uses the Rust grammar for parsing

### Requirement: Tree-sitter extension SHALL support Go files
The system SHALL recognize `.go` and `.mod` files and map them to the `go` grammar ID, resolving the WASM from the `tree-sitter-go` package.

#### Scenario: Go file detection
- **WHEN** a consumer requests Tree-sitter services for `cmd/server.go`
- **THEN** the runtime detects the file as supported and uses the Go grammar for parsing

### Requirement: Tree-sitter extension SHALL support C and C++ files
The system SHALL recognize `.c`, `.h`, `.cpp`, `.hpp`, `.cc`, `.cxx`, `.hxx`, `.c++`, and `.h++` files and map them to the `c` or `cpp` grammar IDs, resolving the WASM from the `tree-sitter-c` and `tree-sitter-cpp` packages respectively.

#### Scenario: C file detection
- **WHEN** a consumer requests Tree-sitter services for `src/main.c`
- **THEN** the runtime detects the file as supported and uses the C grammar for parsing

#### Scenario: C++ file detection
- **WHEN** a consumer requests Tree-sitter services for `src/main.cpp`
- **THEN** the runtime detects the file as supported and uses the C++ grammar for parsing

### Requirement: Tree-sitter extension SHALL support Java files
The system SHALL recognize `.java` files and map them to the `java` grammar ID, resolving the WASM from the `tree-sitter-java` package.

#### Scenario: Java file detection
- **WHEN** a consumer requests Tree-sitter services for `com/example/App.java`
- **THEN** the runtime detects the file as supported and uses the Java grammar for parsing

### Requirement: Tree-sitter extension SHALL support Kotlin files
The system SHALL recognize `.kt` and `.kts` files and map them to the `kotlin` grammar ID, resolving the WASM from the `tree-sitter-kotlin` package.

#### Scenario: Kotlin file detection
- **WHEN** a consumer requests Tree-sitter services for `src/App.kt`
- **THEN** the runtime detects the file as supported and uses the Kotlin grammar for parsing

#### Scenario: Kotlin script file detection
- **WHEN** a consumer requests Tree-sitter services for `build.gradle.kts`
- **THEN** the runtime detects the file as supported and uses the Kotlin grammar for parsing

### Requirement: Tree-sitter extension SHALL support Ruby files
The system SHALL recognize `.rb` files and map them to the `ruby` grammar ID, resolving the WASM from the `tree-sitter-ruby` package.

#### Scenario: Ruby file detection
- **WHEN** a consumer requests Tree-sitter services for `lib/app.rb`
- **THEN** the runtime detects the file as supported and uses the Ruby grammar for parsing

### Requirement: Tree-sitter extension SHALL declare all new grammar packages as peer dependencies
The system SHALL list `tree-sitter-python`, `tree-sitter-rust`, `tree-sitter-go`, `tree-sitter-c`, `tree-sitter-cpp`, `tree-sitter-java`, `tree-sitter-kotlin`, and `tree-sitter-ruby` as `peerDependencies` in `packages/supi-tree-sitter/package.json` so consumers install only the languages they need.

#### Scenario: Package installation
- **WHEN** a consumer installs `@mrclrchtr/supi-tree-sitter`
- **THEN** the package manager reports the new peer dependencies and allows selective installation
