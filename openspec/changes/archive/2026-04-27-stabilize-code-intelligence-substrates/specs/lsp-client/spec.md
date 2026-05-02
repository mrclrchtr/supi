## ADDED Requirements

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
