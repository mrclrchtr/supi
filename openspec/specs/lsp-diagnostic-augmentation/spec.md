# Capability: lsp-diagnostic-augmentation

## Purpose
Silently enrich inline diagnostics after `write`/`edit` tool results with LSP hover and code_actions, teaching the agent LSP exists by showing it working.

## Requirements

### Requirement: Hover augmentation for errors
After a `write` or `edit` tool result, if the file has severity-1 diagnostics, the system SHALL fetch `hover` at the first error position and append the hover content to the diagnostic message.

#### Scenario: Error with hover info available
- **WHEN** the agent writes a file that produces a type error, and LSP hover returns type information at the error position
- **THEN** the inline diagnostic message includes: the error text + "💡 Hover info:" + the hover content (truncated to 3 lines)

#### Scenario: Error with no hover info
- **WHEN** the agent writes a file that produces an error, but LSP returns no hover at that position
- **THEN** the diagnostic message shows only the error (no augmentation)

#### Scenario: No errors present
- **WHEN** the agent writes a file with no severity-1 diagnostics
- **THEN** no augmentation occurs; diagnostics pass through unchanged

### Requirement: Code actions augmentation for errors
After a `write` or `edit` tool result, if the file has severity-1 diagnostics, the system SHALL fetch `code_actions` at the first error position and append available fixes to the diagnostic message.

#### Scenario: Quick-fix available
- **WHEN** the agent writes a file that produces an error with an available quick-fix code action
- **THEN** the inline diagnostic message includes: the error text + "💡 Available fix:" + the action title

#### Scenario: No code actions available
- **WHEN** the agent writes a file that produces an error, but no code actions are available
- **THEN** no code actions section is appended

### Requirement: Timeout and error handling
Diagnostic augmentation SHALL silently fail if LSP calls timeout or error, never blocking the agent.

#### Scenario: LSP slow to respond
- **WHEN** hover or code_actions takes longer than 500ms
- **THEN** the augmentation is skipped and the original diagnostic message is returned

#### Scenario: LSP server crashed
- **WHEN** the LSP server is not running when augmentation is attempted
- **THEN** the augmentation is skipped silently

### Requirement: Scope limiting
Augmentation SHALL only apply to severity-1 (error) diagnostics and only the first error per file.

#### Scenario: Multiple errors in file
- **WHEN** a file has 3 errors
- **THEN** only the first error position is used for hover/code_actions augmentation

#### Scenario: Warnings only
- **WHEN** a file has warnings (severity 2) but no errors
- **THEN** no augmentation occurs
