## MODIFIED Requirements

### Requirement: In-chat rendering via custom message
The `/supi-context` command SHALL send its report as a custom message (`customType: "supi-context"`) with `display: true`. A `MessageRenderer` SHALL be registered to style the output with theme-aware colors in the TUI. The report SHALL include sections from any registered context providers (via supi-core's context-provider registry), rendering each provider's data as a labeled section when data is available.

#### Scenario: Report is rendered in chat
- **WHEN** the user runs `/supi-context`
- **THEN** the report appears in the chat stream as a styled custom message

#### Scenario: Report persists in session
- **WHEN** the user scrolls back in the chat
- **THEN** previous `/supi-context` reports are visible with full styling

#### Scenario: Context provider sections rendered
- **WHEN** registered context providers return data
- **THEN** each provider's data is rendered as a labeled section in the report

#### Scenario: No context providers registered
- **WHEN** no context providers have been registered
- **THEN** no extra provider sections appear in the report

#### Scenario: Context provider returns null
- **WHEN** a registered context provider's `getData()` returns `null`
- **THEN** that provider's section is omitted from the report
