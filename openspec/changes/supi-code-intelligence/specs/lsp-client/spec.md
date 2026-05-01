## ADDED Requirements

### Requirement: Session-scoped LSP services SHALL be reusable by peer extensions
The system SHALL expose a shared session-scoped LSP service acquisition API so peer extensions can reuse the active LSP runtime and its initialized managers without starting duplicate server processes.

#### Scenario: Peer extension acquires existing LSP service
- **WHEN** a peer extension such as `supi-code-intelligence` requests access to the LSP runtime after `supi-lsp` has initialized for the session
- **THEN** the system returns the shared session-scoped service instead of creating a second independent server lifecycle

#### Scenario: Peer extension requests LSP service before initialization completes
- **WHEN** a peer extension requests the shared LSP service before the first usable manager is ready
- **THEN** the system returns a well-defined unavailable or pending result rather than spawning duplicate servers implicitly

### Requirement: LSP client SHALL support implementation-provider requests when servers advertise them
The system SHALL support `textDocument/implementation` requests through the reusable LSP client layer when the active server advertises implementation-provider capability.

#### Scenario: Server supports implementation requests
- **WHEN** a peer extension requests implementations for a symbol in a file whose server advertises implementation-provider support
- **THEN** the client sends `textDocument/implementation` and returns the resulting implementation locations

#### Scenario: Server does not support implementation requests
- **WHEN** a peer extension requests implementations for a symbol in a file whose server does not advertise implementation-provider support
- **THEN** the client returns a clear unsupported result rather than treating the absence of support as an empty successful match
