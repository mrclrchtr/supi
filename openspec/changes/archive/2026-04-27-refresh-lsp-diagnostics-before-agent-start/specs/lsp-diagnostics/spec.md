## ADDED Requirements

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
