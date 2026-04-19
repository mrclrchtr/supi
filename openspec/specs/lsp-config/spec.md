# Capability: lsp-config

## Purpose
TBD

## Requirements

### Requirement: Default server definitions
The system SHALL ship with pre-configured server definitions for TypeScript, Python, Rust, Go, and C/C++ that include the server command, arguments, file type associations, and root markers.

#### Scenario: TypeScript project detected
- **WHEN** the agent interacts with a `.ts` or `.tsx` file and `typescript-language-server` is on PATH
- **THEN** the system uses the default TypeScript server config: command `typescript-language-server`, args `["--stdio"]`, fileTypes `["ts", "tsx", "js", "jsx"]`, rootMarkers `["tsconfig.json", "package.json"]`

#### Scenario: Rust project detected
- **WHEN** the agent interacts with a `.rs` file and `rust-analyzer` is on PATH
- **THEN** the system uses the default Rust server config: command `rust-analyzer`, fileTypes `["rs"]`, rootMarkers `["Cargo.toml"]`

### Requirement: Per-project configuration override
The system SHALL load `.pi-lsp.json` from the project root (if present) and merge it with default server definitions, with project config taking precedence.

#### Scenario: Project disables a default server
- **WHEN** `.pi-lsp.json` contains `{ "servers": { "typescript-language-server": { "enabled": false } } }`
- **THEN** the TypeScript server is not started even when `.ts` files are encountered

#### Scenario: Project adds a custom server
- **WHEN** `.pi-lsp.json` defines a new server not in defaults (e.g., `elm-language-server`)
- **THEN** the system uses that server definition for the specified file types

#### Scenario: No project config file
- **WHEN** no `.pi-lsp.json` exists in the project root
- **THEN** the system uses only the built-in default server definitions

### Requirement: Language-to-server mapping
The system SHALL map file extensions to server configurations and select the appropriate server for each file.

#### Scenario: Known extension
- **WHEN** a file with extension `.py` is encountered
- **THEN** the system resolves to the `pyright` (or configured Python) server definition

#### Scenario: Multiple servers for same extension
- **WHEN** two servers claim the same file extension (e.g., both `biome` and `typescript-language-server` handle `.ts`)
- **THEN** the system uses the first server in priority order (project config > defaults order)

#### Scenario: Unknown extension
- **WHEN** a file with extension `.xyz` has no server mapping
- **THEN** no server is started and LSP operations return "no server available"

### Requirement: Server command validation
The system SHALL verify that the configured server command exists on PATH before attempting to spawn it.

#### Scenario: Server binary exists
- **WHEN** the configured command `rust-analyzer` is found via PATH lookup
- **THEN** the server is eligible for spawning

#### Scenario: Server binary missing
- **WHEN** the configured command `gopls` is not found on PATH
- **THEN** the system logs a debug message and skips this server; no error is raised

### Requirement: Root marker detection
The system SHALL detect the project root for each server by searching upward from the file's directory for the server's configured root markers.

#### Scenario: Root marker found
- **WHEN** editing `src/lib/utils.ts` and `package.json` exists at `src/../../package.json`
- **THEN** the project root is resolved to the directory containing `package.json`

#### Scenario: No root marker found
- **WHEN** no root marker files are found searching upward to filesystem root
- **THEN** the system falls back to the current working directory as the project root

### Requirement: Supi shared config controls
The system SHALL read LSP enable/disable, severity threshold, and server allowlist from the supi shared config `"lsp"` section. The `enabled` key (boolean) controls whether LSP is active. The `severity` key (number 1-4) sets the inline diagnostic threshold. The `servers` key (string array) restricts which servers are enabled. An unset or empty `servers` array means all configured servers are enabled.

#### Scenario: LSP disabled via config
- **WHEN** the supi shared config contains `{ "lsp": { "enabled": false } }` (project or global)
- **THEN** no LSP servers are started, no LSP tool is registered, and the system shows a notification that LSP is disabled

#### Scenario: LSP enabled (default)
- **WHEN** no `enabled` key exists in the `"lsp"` config section, or `enabled` is `true`
- **THEN** LSP functionality proceeds normally

#### Scenario: Severity threshold from config
- **WHEN** the supi shared config contains `{ "lsp": { "severity": 2 } }`
- **THEN** inline diagnostics are shown for errors and warnings (severity ≤ 2)

#### Scenario: Severity default
- **WHEN** no `severity` key exists in the `"lsp"` config section
- **THEN** inline diagnostics default to severity 1 (errors only)

#### Scenario: Server allowlist from config
- **WHEN** the supi shared config contains `{ "lsp": { "servers": ["rust-analyzer", "pyright"] } }`
- **THEN** only `rust-analyzer` and `pyright` servers are eligible; all others are filtered out during config loading

#### Scenario: Server allowlist empty or unset (default)
- **WHEN** the `servers` key is absent or an empty array in the `"lsp"` config section
- **THEN** all configured servers (from defaults and `.pi-lsp.json`) are eligible

#### Scenario: Env vars are ignored
- **WHEN** `PI_LSP_DISABLED`, `PI_LSP_SEVERITY`, or `PI_LSP_SERVERS` environment variables are set
- **THEN** the env vars have no effect; only supi shared config is read

### Requirement: LSP settings registration
supi-lsp SHALL register its settings with the supi-core settings registry during extension initialization, providing items for "Enable LSP" (boolean toggle), "Inline Severity" (value cycling 1-4), and "Active Servers" (submenu with per-server toggles).

#### Scenario: LSP settings appear in /supi-settings
- **WHEN** the user opens `/supi-settings`
- **THEN** the LSP section shows three settings: Enable LSP, Inline Severity, and Active Servers

#### Scenario: Toggling LSP disabled via settings UI
- **WHEN** the user sets "Enable LSP" to "off" in the settings overlay
- **THEN** the change is persisted to the active scope's config and takes effect on next session start

#### Scenario: Server allowlist submenu
- **WHEN** the user activates the "Active Servers" setting
- **THEN** a submenu opens showing all servers from the merged config (defaults + `.pi-lsp.json`) as enabled/disabled toggles

#### Scenario: Server toggle persistence
- **WHEN** the user toggles a server to "disabled" in the server submenu
- **THEN** the server name is removed from the `servers` allowlist in the active scope's config
