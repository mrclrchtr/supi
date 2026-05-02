## ADDED Requirements

### Requirement: Public LSP service API SHALL be importable from the package root
The system SHALL expose a documented reusable LSP service API from `@mrclrchtr/supi-lsp` so peer extensions can consume shared semantic services without importing private implementation files.

#### Scenario: Peer extension imports the package root
- **WHEN** another workspace package imports from `@mrclrchtr/supi-lsp`
- **THEN** it can access the documented service acquisition function and public TypeScript types from the package root
- **AND** it does not need to import `manager.ts`, `client.ts`, or other private implementation files

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

### Requirement: LSP client SHALL support implementation-provider requests when servers advertise them
The system SHALL support `textDocument/implementation` requests through the reusable LSP client layer when the active server advertises implementation-provider capability.

#### Scenario: Server supports implementation requests
- **WHEN** a peer extension requests implementations for a symbol in a file whose server advertises implementation-provider support
- **THEN** the client sends `textDocument/implementation` and returns the resulting implementation locations

#### Scenario: Server does not support implementation requests
- **WHEN** a peer extension requests implementations for a symbol in a file whose server does not advertise implementation-provider support
- **THEN** the client returns a clear unsupported result rather than treating the absence of support as an empty successful match
