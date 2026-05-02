# Capability: lsp-client

## Purpose
TBD

## Requirements

### Requirement: LSP server spawning
The system SHALL spawn an LSP server subprocess via stdio when the agent first interacts with a file whose language has a configured server.

#### Scenario: First file interaction triggers server start
- **WHEN** the agent reads or edits a `.ts` file and no TypeScript LSP server is running
- **THEN** the system spawns `typescript-language-server --stdio`, sends `initialize` with the detected project root, and waits for `initialized` response

#### Scenario: Server already running for language
- **WHEN** the agent interacts with a second `.ts` file and a TypeScript server is already running
- **THEN** the system reuses the existing server instance (no new spawn)

### Requirement: JSON-RPC transport
The system SHALL implement JSON-RPC 2.0 over stdio with Content-Length header framing for all LSP communication.

#### Scenario: Request-response roundtrip
- **WHEN** a request is sent to the server with a numeric `id`
- **THEN** the system correlates the response by `id` and resolves the pending promise

#### Scenario: Server notification handling
- **WHEN** the server sends a notification (no `id` field, e.g., `textDocument/publishDiagnostics`)
- **THEN** the system dispatches it to the registered notification handler without sending a response

#### Scenario: Partial message buffering
- **WHEN** the server sends a message split across multiple chunks
- **THEN** the system buffers until the full Content-Length payload is received before parsing

### Requirement: Document synchronization
The system SHALL keep the LSP server's document state in sync with the agent's file operations using `textDocument/didOpen`, `textDocument/didChange` (full sync), and `textDocument/didClose`.

#### Scenario: File opened for first time
- **WHEN** the agent reads a file that has an active LSP server
- **THEN** the system sends `textDocument/didOpen` with the file URI, language ID, version 1, and full file content

#### Scenario: File content updated
- **WHEN** the agent writes or edits an already-opened file
- **THEN** the system sends `textDocument/didChange` with an incremented version and the full new content

### Requirement: Server shutdown on session end
The system SHALL send `shutdown` then `exit` to all running LSP servers when the pi session ends, and kill any server process that does not exit within 5 seconds.

#### Scenario: Clean shutdown
- **WHEN** the session ends and servers are running
- **THEN** the system sends `shutdown` request to each server, waits for response, sends `exit` notification, and the server process terminates

#### Scenario: Unresponsive server
- **WHEN** a server does not respond to `shutdown` within 5 seconds
- **THEN** the system kills the server process via SIGTERM

### Requirement: Spawn failure resilience
The system SHALL NOT block agent operation if an LSP server fails to start.

#### Scenario: Server binary not found
- **WHEN** the configured server command is not found on PATH
- **THEN** the system logs a warning and marks the server as unavailable for the session; the agent continues without LSP for that language

#### Scenario: Server crashes during initialization
- **WHEN** the server process exits during the initialize handshake
- **THEN** the system logs the error and marks the server as unavailable; no retry is attempted in the current session

### Requirement: Client SHALL advertise diagnostic version support
The LSP client SHALL advertise support for `textDocument.publishDiagnostics.versionSupport` during initialization so servers may include document versions in diagnostic publications. The client SHALL use those versions to protect the diagnostic cache from older publications when possible.

#### Scenario: Initialize includes version support
- **WHEN** the LSP client sends the `initialize` request
- **THEN** the client capabilities include `textDocument.publishDiagnostics.versionSupport: true`

#### Scenario: Versioned diagnostics are received
- **WHEN** the server sends `textDocument/publishDiagnostics` with a version
- **THEN** the client compares the publication version with the synced document version before updating the diagnostic cache

### Requirement: Client MAY use LSP 3.17 pull diagnostics when advertised
When an LSP server advertises `diagnosticProvider`, the client MAY request diagnostics using LSP 3.17 pull diagnostic requests during internal refresh operations. Pull diagnostic support SHALL be capability-gated and SHALL fall back to push-diagnostic refresh behavior when unsupported or when a pull request fails.

#### Scenario: Server advertises document diagnostic provider
- **WHEN** the initialized server capabilities include `diagnosticProvider`
- **AND** the client refreshes diagnostics for an open document
- **THEN** the client may send `textDocument/diagnostic` for that document
- **AND** returned full diagnostic reports update the diagnostic cache for that document

#### Scenario: Server does not advertise diagnostic provider
- **WHEN** the initialized server capabilities do not include `diagnosticProvider`
- **AND** the client refreshes diagnostics
- **THEN** the client uses document synchronization and push-diagnostic settling instead of sending pull diagnostic requests

#### Scenario: Pull diagnostics return related documents
- **WHEN** a `textDocument/diagnostic` response includes related document reports
- **THEN** the client updates the diagnostic cache for related documents that include full diagnostic reports

#### Scenario: Pull diagnostic request fails
- **WHEN** a pull diagnostic request errors, is cancelled, or times out
- **THEN** the client falls back to the freshest available push-diagnostic cache
- **AND** agent operation continues without throwing an uncaught error

### Requirement: Public LSP service API SHALL be importable from the package root
The system SHALL expose a documented reusable LSP service API from `@mrclrchtr/supi-lsp` so peer extensions can consume shared semantic services without importing private implementation files.

#### Scenario: Peer extension imports the package root
- **WHEN** another workspace package imports from `@mrclrchtr/supi-lsp`
- **THEN** it can access the documented service acquisition function and public TypeScript types from the package root
- **AND** it does not need to import `manager.ts`, `client.ts`, or other private implementation files

#### Scenario: Published package exposes the root API
- **WHEN** `@mrclrchtr/supi-lsp` is consumed through its package root from the workspace package surface
- **THEN** the documented root entrypoint resolves to the public library API
- **AND** the package metadata includes the files needed for that root import to work when installed or packed

### Requirement: Session-scoped LSP services SHALL be reusable by peer extensions
The system SHALL expose a shared session-scoped LSP service acquisition API so peer extensions can reuse the active LSP runtime and its initialized managers without starting duplicate server processes.

#### Scenario: Peer extension acquires existing LSP service
- **WHEN** a peer extension such as `supi-code-intelligence` requests access to the LSP runtime after `supi-lsp` has initialized for the session
- **THEN** the system returns the shared session-scoped service instead of creating a second independent server lifecycle

#### Scenario: Peer extension requests LSP service before initialization completes
- **WHEN** a peer extension requests the shared LSP service before the first usable manager is ready
- **THEN** the system returns a well-defined pending result rather than spawning duplicate servers implicitly

#### Scenario: Peer extension requests LSP service while the extension is disabled
- **WHEN** a peer extension requests the shared LSP service for a session where LSP settings have disabled the extension
- **THEN** the system returns a well-defined disabled or unavailable result instead of a duplicate lifecycle or an uncaught error

#### Scenario: Session service is invalidated after shutdown
- **WHEN** a session publishes a ready LSP service for a cwd
- **AND** that session shuts down or the extension clears its runtime state
- **THEN** later acquisition for that cwd returns a non-ready state rather than the old service instance
- **AND** peer extensions cannot accidentally reuse a shut-down manager through the public service API

### Requirement: Session LSP service SHALL expose stable semantic and project-inspection operations
The system SHALL expose a public `SessionLspService` wrapper with stable semantic operations and project-inspection helpers. The wrapper SHALL provide structured access to hover, definition, references, workspace symbol search, implementation lookup, document symbols, project server information, supported-file checks, outstanding diagnostics, and outstanding diagnostic summaries without exposing raw `LspManager` internals as the public contract.

#### Scenario: Peer extension performs semantic lookups through the service
- **WHEN** a peer extension receives a ready session LSP service
- **THEN** it can request hover, definition, references, workspace symbols, implementations, and document symbols through documented service methods
- **AND** those methods return structured LSP result data or clear unavailable/unsupported results suitable for higher-level composition

#### Scenario: Peer extension inspects project and diagnostic state through the service
- **WHEN** a peer extension receives a ready session LSP service
- **THEN** it can inspect active project servers and supported source files through documented helpers
- **AND** it can retrieve outstanding diagnostics and diagnostic summaries without using prompt/UI-specific internals

#### Scenario: Public service does not leak manager internals
- **WHEN** a peer extension uses the package-root API
- **THEN** it does not need to import, construct, or depend on `LspManager` directly
- **AND** implementation-specific manager helper methods are not required for normal public service use

### Requirement: LSP client SHALL support implementation-provider requests when servers advertise them
The system SHALL support `textDocument/implementation` requests through the reusable LSP client layer when the active server advertises implementation-provider capability.

#### Scenario: Server supports implementation requests
- **WHEN** a peer extension requests implementations for a symbol in a file whose server advertises implementation-provider support
- **THEN** the client sends `textDocument/implementation` and returns the resulting implementation locations

#### Scenario: Server does not support implementation requests
- **WHEN** a peer extension requests implementations for a symbol in a file whose server does not advertise implementation-provider support
- **THEN** the client returns a clear unsupported result rather than treating the absence of support as an empty successful match
