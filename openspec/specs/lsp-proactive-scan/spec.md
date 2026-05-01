# Capability: lsp-proactive-scan

## Purpose
Proactive session-start scanning and eager startup for project-relevant LSP servers.

## ADDED Requirements

### Requirement: Project scanning SHALL detect available LSP servers at session start
The system SHALL scan the working directory at `session_start` to detect which LSP servers are available. For each configured server, the scan SHALL check whether any of the server's `rootMarkers` exist within the project tree (max depth 3, excluding `node_modules` and `.git` directories) AND whether the server's binary is available on PATH via `commandExists`.

#### Scenario: TypeScript project detected
- **WHEN** `tsconfig.json` exists in the project tree and `typescript-language-server` is on PATH
- **THEN** the scan reports typescript-language-server as available with its matched file types

#### Scenario: Server binary not installed
- **WHEN** `Cargo.toml` exists in the project tree but `rust-analyzer` is not on PATH
- **THEN** the scan does not report rust-analyzer as available

#### Scenario: No rootMarkers match
- **WHEN** a configured server's rootMarkers do not exist anywhere in the project tree
- **THEN** the scan does not report that server as available

#### Scenario: Ignored directories are excluded
- **WHEN** rootMarkers exist only inside `node_modules` or `.git` directories
- **THEN** the scan does not match those rootMarkers

### Requirement: Project roots SHALL be deduplicated using topmost-root algorithm
The system SHALL deduplicate discovered roots so that monorepos with nested rootMarkers start one server per logical project root, not one per rootMarker file. The algorithm SHALL sort found roots by path length (shortest first) and skip any candidate whose directory is a child of an already-accepted root.

#### Scenario: Monorepo with root and sub-project tsconfigs
- **WHEN** `tsconfig.json` exists at `/project/` and at `/project/packages/frontend/` and `/project/packages/backend/`
- **THEN** only `/project/` is accepted as a root for typescript-language-server
- **AND** the sub-project directories are absorbed by the topmost root

#### Scenario: Independent sub-projects without shared root
- **WHEN** `tsconfig.json` exists at `/repo/app-a/` and `/repo/app-b/` but not at `/repo/`
- **THEN** both `/repo/app-a/` and `/repo/app-b/` are accepted as separate roots

#### Scenario: Mixed server types
- **WHEN** `tsconfig.json` exists at `/project/` and `Cargo.toml` exists at `/project/crates/core/`
- **THEN** each server type is deduplicated independently — one TS root and one Rust root

### Requirement: Matched servers SHALL be started eagerly at session start
The system SHALL start all detected servers in parallel during `session_start`. Each server SHALL complete the LSP initialize handshake (spawn + `initialize` request + `initialized` notification). No files SHALL be opened — the server is warm but idle.

#### Scenario: Single server detected
- **WHEN** the scan detects typescript-language-server with root `/project/`
- **THEN** the server is spawned, the initialize handshake completes, and the server status is "running"

#### Scenario: Multiple servers detected
- **WHEN** the scan detects typescript-language-server and rust-analyzer
- **THEN** both servers are started in parallel

#### Scenario: Server startup fails
- **WHEN** a server binary exists on PATH but the initialize handshake fails
- **THEN** the server is marked as unavailable and the scan continues without it
- **AND** subsequent lazy startup via `getClientForFile` also treats it as unavailable

### Requirement: Scan SHALL refresh on session reload
The system SHALL re-run the project scan and re-register the tool when a session reload occurs (via `/reload` triggering `session_start`). This allows mid-session binary installs to be detected without starting a new session.

#### Scenario: Server installed mid-session
- **WHEN** the user installs `pyright-langserver` and then triggers `/reload`
- **THEN** the next `session_start` scan detects pyright as available and starts it

#### Scenario: Existing servers survive reload
- **WHEN** a reload occurs with running servers
- **THEN** existing servers are shut down and re-scanned fresh

### Requirement: Server capabilities SHALL be introspected after startup
After each server completes its initialize handshake, the system SHALL read the server's `ServerCapabilities` to determine which LSP actions (hover, definition, references, documentSymbol, rename, codeAction) the server actually supports. Only supported actions SHALL be included in the project-specific `promptGuidelines`.

#### Scenario: Server supports all actions
- **WHEN** a server reports `hoverProvider`, `definitionProvider`, `referencesProvider`, `documentSymbolProvider`, `renameProvider`, and `codeActionProvider` as true
- **THEN** all corresponding actions are listed in the guidelines

#### Scenario: Server lacks rename support
- **WHEN** a server does not report `renameProvider` in its capabilities
- **THEN** the rename action is omitted from the guidelines for that server

### Requirement: /lsp-status overlay SHALL show proactive scan data
The `/lsp-status` overlay and status bar SHALL use scan results to display server information from session start, even before any files are opened. The overlay SHALL show detected servers with their name, root directory, supported file types, supported actions (from `ServerCapabilities`), and running status.

#### Scenario: Servers running with no open files
- **WHEN** servers have been started eagerly at session_start but no files have been opened yet
- **THEN** the `/lsp-status` overlay shows each running server with its root, file types, and supported actions
- **AND** the status bar shows the server count (e.g., "λ lsp 1 server")

#### Scenario: Servers running with open files
- **WHEN** servers are running and files have been opened
- **THEN** the overlay shows server info, open files, and diagnostics as before
- **AND** the additional scan data (roots, file types, actions) remains visible

#### Scenario: Server startup failed
- **WHEN** a server was detected by the scan but failed to start
- **THEN** the overlay shows the server as unavailable with its root and file types

#### Scenario: No servers detected
- **WHEN** no servers were detected by the scan
- **THEN** the overlay shows "no LSP servers available for this project"

### Requirement: Project root detection utilities SHALL be provided by supi-core
The functions used by `supi-lsp` for project walking, project root detection, root deduplication, root specificity sorting, path containment, and known-root resolution SHALL be imported from `supi-core` instead of being defined locally in `supi-lsp`. The behavior of each function SHALL remain identical; this is a pure extraction with no semantic changes to LSP scanning.

#### Scenario: supi-lsp scanner uses supi-core walkProject
- **WHEN** `supi-lsp` calls `walkProject` during project scanning
- **THEN** the function behaves identically to its previous local definition, including depth limit, ignored directories, and callback signature

#### Scenario: supi-lsp findProjectRoot uses supi-core implementation
- **WHEN** `supi-lsp` calls `findProjectRoot` to resolve a file to its project root
- **THEN** the upward walk and marker matching behavior is unchanged

#### Scenario: supi-lsp dedupeTopmostRoots uses supi-core implementation
- **WHEN** `supi-lsp` calls `dedupeTopmostRoots` during root deduplication
- **THEN** the topmost-root algorithm produces the same results as before

#### Scenario: supi-lsp manager roots use supi-core path utilities
- **WHEN** `supi-lsp` calls helpers such as `sortRootsBySpecificity`, `buildKnownRootsMap`, `mergeKnownRoots`, `resolveKnownRoot`, `isWithin`, or related path-depth helpers
- **THEN** those helpers behave identically to their previous local definitions
