# Capability: lsp-diagnostics

## Purpose
TBD

## Requirements

### Requirement: Write/edit interception for diagnostic feedback
The system SHALL intercept `write` and `edit` tool calls, sync the resulting file content with the LSP server, and append error-level diagnostics to the tool result.

#### Scenario: Write introduces a type error
- **WHEN** the agent writes a file and the LSP server reports error-level diagnostics after sync
- **THEN** the error diagnostics are appended to the write tool's result text so the agent sees them immediately

#### Scenario: Write with no errors
- **WHEN** the agent writes a file and the LSP server reports no error-level diagnostics
- **THEN** the tool result is not modified

#### Scenario: Write to file with no LSP server
- **WHEN** the agent writes a file that has no active LSP server (unsupported language or server unavailable)
- **THEN** the tool result is not modified and no error occurs

### Requirement: Diagnostic collection from server notifications
The system SHALL collect diagnostics from `textDocument/publishDiagnostics` server notifications and store them per-file, replacing previous diagnostics for that file on each update.

#### Scenario: Server publishes diagnostics
- **WHEN** the LSP server sends a `textDocument/publishDiagnostics` notification with 3 diagnostics
- **THEN** the system stores those 3 diagnostics for the file, replacing any previously stored diagnostics

#### Scenario: Diagnostics cleared by server
- **WHEN** the LSP server sends `textDocument/publishDiagnostics` with an empty diagnostics array
- **THEN** the system clears all stored diagnostics for that file

### Requirement: Severity filtering
The system SHALL only surface error-level diagnostics (severity 1) inline after write/edit by default. Warnings and hints SHALL be available via the `lsp` tool's `diagnostics` action.

#### Scenario: Mix of errors and warnings
- **WHEN** the agent writes a file and the server reports 1 error and 3 warnings
- **THEN** only the 1 error is appended to the tool result inline; all 4 are available via `action: "diagnostics"`

#### Scenario: Custom severity threshold
- **WHEN** `PI_LSP_SEVERITY` is set to `2` (warning level)
- **THEN** both errors and warnings are surfaced inline after write/edit

### Requirement: Diagnostic wait timeout
The system SHALL wait a bounded time for diagnostics after syncing a file, to avoid blocking the agent indefinitely.

#### Scenario: Server responds quickly
- **WHEN** the LSP server publishes diagnostics within 3 seconds of document sync
- **THEN** the diagnostics are collected and surfaced

#### Scenario: Server is slow to respond
- **WHEN** the LSP server does not publish diagnostics within 3 seconds
- **THEN** the system proceeds without diagnostics and does not block the agent

### Requirement: Multi-file diagnostic refresh SHALL be bounded and settling-based
The system SHALL provide an internal diagnostic refresh operation that re-syncs all currently open, existing documents for active LSP clients and waits for diagnostic updates to settle. The operation SHALL complete when no diagnostic publications have arrived for the configured quiet window or when the configured maximum wait time expires, whichever happens first.

#### Scenario: Diagnostics settle quickly
- **WHEN** the diagnostic refresh operation re-syncs open files
- **AND** the LSP server publishes diagnostics and then remains quiet for the configured quiet window
- **THEN** the refresh operation completes before the maximum wait time
- **AND** subsequent diagnostic summaries use the newly published diagnostics

#### Scenario: Server continues processing
- **WHEN** the LSP server continues publishing diagnostics until the maximum wait time is reached
- **THEN** the refresh operation completes at the maximum wait time
- **AND** subsequent diagnostic summaries use the freshest diagnostics received before timeout

#### Scenario: Open file was deleted
- **WHEN** an open document no longer exists on disk during diagnostic refresh
- **THEN** the system closes that document and clears its cached diagnostics
- **AND** the missing file does not appear in outstanding diagnostic summaries

### Requirement: Diagnostic cache SHALL track freshness metadata
The system SHALL store diagnostics with metadata including the time they were received and the associated document version when the server provides one. Existing summary APIs SHALL continue to expose diagnostics in their current shape while using the metadata internally to avoid stale cache updates.

#### Scenario: Diagnostic publication includes version
- **WHEN** the LSP server publishes diagnostics with a document version
- **THEN** the system stores the diagnostics with that version and receive timestamp

#### Scenario: Diagnostic publication omits version
- **WHEN** the LSP server publishes diagnostics without a document version
- **THEN** the system stores the diagnostics with a receive timestamp
- **AND** the publication replaces the previous diagnostics for that file using existing push-diagnostic semantics

### Requirement: Older diagnostic versions SHALL NOT overwrite newer document state
When a diagnostic publication includes a document version lower than the client's current synced version for that open document, the system SHALL ignore that publication instead of replacing the cached diagnostics.

#### Scenario: Delayed old diagnostics arrive after a newer sync
- **WHEN** the client has synced document version 5 for a file
- **AND** the LSP server publishes diagnostics for version 4 of that file
- **THEN** the system ignores the version 4 diagnostics
- **AND** the cached diagnostics for the file remain unchanged

#### Scenario: Diagnostics match current version
- **WHEN** the client has synced document version 5 for a file
- **AND** the LSP server publishes diagnostics for version 5 of that file
- **THEN** the system stores the published diagnostics as the current diagnostics for that file
