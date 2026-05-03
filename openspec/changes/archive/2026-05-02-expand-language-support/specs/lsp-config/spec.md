## MODIFIED Requirements

### Requirement: Default server definitions
The system SHALL ship with pre-configured server definitions for TypeScript, Python, Rust, Go, C/C++, Ruby, Java, and Kotlin that include the server command, arguments, file type associations, and root markers.

### Requirement: LSP server definitions SHALL be loaded from supi config with per-language-key override resolution
The system SHALL read server definitions from the supi shared config `lsp.servers` key. Keys SHALL be **language names** (e.g., `typescript`, `python`, `rust`, `c`, `cpp`, `ruby`, `java`, `kotlin`), not server binary names. Each language entry SHALL be merged individually against built-in defaults: any omitted field (`args`, `fileTypes`, `rootMarkers`) falls back to the default for that language. The legacy `.pi-lsp.json` file SHALL NOT be read.

#### Scenario: Project config overrides one server command
- **WHEN** `.pi/supi/config.json` contains `{ "lsp": { "servers": { "typescript": { "command": "vtsls" } } } }`
- **THEN** the TypeScript server uses command `vtsls`
- **AND** `args`, `fileTypes`, and `rootMarkers` for TypeScript remain as built-in defaults

#### Scenario: Project config adds a custom language
- **WHEN** `.pi/supi/config.json` contains `{ "lsp": { "servers": { "zig": { "command": "zls", "args": [], "fileTypes": ["zig"], "rootMarkers": ["build.zig"] } } } }`
- **THEN** the system adds the `zig` language server alongside all built-in defaults

#### Scenario: Global config overrides with per-key fallback
- **WHEN** `~/.pi/agent/supi/config.json` contains `{ "lsp": { "servers": { "python": { "command": "pylsp" } } } }` and no project config overrides exist
- **THEN** the Python server uses command `pylsp`
- **AND** `fileTypes` and `rootMarkers` for Python remain as built-in defaults

#### Scenario: No custom definitions
- **WHEN** neither global nor project config contains `lsp.servers`
- **THEN** the system uses only the built-in default server definitions

#### Scenario: `.pi-lsp.json` is ignored
- **WHEN** `.pi-lsp.json` exists in the project root
- **THEN** the system does not read it
- **AND** server definitions come exclusively from built-in defaults or supi config

#### Scenario: TypeScript project detected
- **WHEN** the agent interacts with a `.ts` or `.tsx` file and `typescript-language-server` is on PATH
- **THEN** the system uses the default TypeScript server config: command `typescript-language-server`, args `["--stdio"]`, fileTypes `["ts", "tsx", "js", "jsx"]`, rootMarkers `["tsconfig.json", "package.json"]`

#### Scenario: Rust project detected
- **WHEN** the agent interacts with a `.rs` file and `rust-analyzer` is on PATH
- **THEN** the system uses the default Rust server config: command `rust-analyzer`, fileTypes `["rs"]`, rootMarkers `["Cargo.toml"]`

#### Scenario: Python project detected
- **WHEN** the agent interacts with a `.py` file and `pyright-langserver` is on PATH
- **THEN** the system uses the default Python server config: command `pyright-langserver`, args `["--stdio"]`, fileTypes `["py", "pyi"]`, rootMarkers `["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "pyrightconfig.json"]`

#### Scenario: Go project detected
- **WHEN** the agent interacts with a `.go` file and `gopls` is on PATH
- **THEN** the system uses the default Go server config: command `gopls`, args `["serve"]`, fileTypes `["go", "mod"]`, rootMarkers `["go.mod", "go.sum"]`

#### Scenario: C/C++ project detected
- **WHEN** the agent interacts with a `.cpp` or `.c` file and `clangd` is on PATH
- **THEN** the system uses the default C/C++ server config: command `clangd`, args `["--background-index"]`, fileTypes `["c", "h", "cpp", "hpp", "cc", "cxx", "hxx", "c++", "h++"]`, rootMarkers `["compile_commands.json", "CMakeLists.txt", ".clangd", "Makefile"]`

#### Scenario: Ruby project detected
- **WHEN** the agent interacts with a `.rb` file and `ruby-lsp` is on PATH
- **THEN** the system uses the default Ruby server config: command `ruby-lsp`, args `[]`, fileTypes `["rb", "erb", "gemspec"]`, rootMarkers `["Gemfile", ".ruby-version"]`

#### Scenario: Java project detected
- **WHEN** the agent interacts with a `.java` file and `jdtls` is on PATH
- **THEN** the system uses the default Java server config: command `jdtls`, args `[]`, fileTypes `["java"]`, rootMarkers `["pom.xml", "build.gradle", ".git"]`

#### Scenario: Kotlin project detected
- **WHEN** the agent interacts with a `.kt` file and `kotlin-lsp` is on PATH
- **THEN** the system uses the default Kotlin server config: command `kotlin-lsp`, args `[]`, fileTypes `["kt", "kts"]`, rootMarkers `["build.gradle.kts", "pom.xml", ".git"]`
