## ADDED Requirements

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
