## MODIFIED Requirements

### Requirement: Supi shared config controls
The system SHALL read LSP `enabled` and `severity` settings dynamically during `session_start` rather than caching them at extension factory time. If `enabled` is `false`, the system SHALL skip LSP initialization for that session while keeping handlers registered. If `enabled` becomes `true` later (e.g., after a `/reload`), the system SHALL initialize normally on the next `session_start`.

#### Scenario: Enabling LSP via settings after starting disabled
- **WHEN** the user sets `"lsp.enabled"` to `true` in config and runs `/reload`
- **THEN** LSP initializes normally on the next `session_start` without requiring a process restart

#### Scenario: Severity change takes effect on reload
- **WHEN** the user changes `"lsp.severity"` from `1` to `2` in config and runs `/reload`
- **THEN** the new severity threshold is used for inline diagnostics in the next session

#### Scenario: Server allowlist submenu inspected without changes
- **WHEN** the user opens the "Active Servers" submenu and presses Escape without toggling any server
- **THEN** no config change is persisted; the allowlist remains unset (all servers enabled)
