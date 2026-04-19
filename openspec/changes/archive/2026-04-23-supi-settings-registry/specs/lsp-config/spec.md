## MODIFIED Requirements

### Requirement: Environment variable controls
The system SHALL read LSP enable/disable, severity threshold, and server allowlist from the supi shared config `"lsp"` section instead of environment variables. The `enabled` key (boolean) replaces `PI_LSP_DISABLED`. The `severity` key (number 1-4) replaces `PI_LSP_SEVERITY`. The `servers` key (string array) replaces `PI_LSP_SERVERS`. An unset or empty `servers` array means all configured servers are enabled.

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

## REMOVED Requirements

### Requirement: Environment variable controls
**Reason**: Replaced by supi shared config under `"lsp"` section with persistent storage and UI.
**Migration**: Move `PI_LSP_DISABLED=1` → `{ "lsp": { "enabled": false } }` in config. Move `PI_LSP_SEVERITY=2` → `{ "lsp": { "severity": 2 } }`. Move `PI_LSP_SERVERS=rust-analyzer,pyright` → `{ "lsp": { "servers": ["rust-analyzer", "pyright"] } }`.

## ADDED Requirements

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
