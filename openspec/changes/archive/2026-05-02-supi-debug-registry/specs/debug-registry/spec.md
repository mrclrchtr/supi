## ADDED Requirements

### Requirement: Debug event registry API
The system SHALL provide a shared debug event registry in `supi-core` for SuPi extensions to record and query session-local debug events. The registry SHALL use a `globalThis` + `Symbol.for` storage key so registrations and events are shared across jiti module resolution boundaries.

#### Scenario: Extension records a debug event
- **WHEN** an extension calls the debug registry with source, level, category, message, and event data while debugging is enabled
- **THEN** the event is appended to the shared registry with an id and timestamp

#### Scenario: Debugging disabled
- **WHEN** an extension records a debug event while debugging is disabled
- **THEN** the registry does not retain the event

#### Scenario: Events are queried
- **WHEN** a consumer queries debug events with source, level, category, or limit filters
- **THEN** the registry returns only matching events up to the requested limit in newest-first order

#### Scenario: Registry cleanup
- **WHEN** the debug registry is cleared
- **THEN** all retained events are removed

### Requirement: Bounded session-local retention
The debug registry SHALL retain events in memory only and SHALL drop the oldest events when the configured maximum event count is exceeded.

#### Scenario: Maximum event count exceeded
- **WHEN** the registry maximum is 2 and three events are recorded
- **THEN** only the two newest events remain available

#### Scenario: Session starts
- **WHEN** a `session_start` event fires for the `supi-debug` extension
- **THEN** retained debug events are cleared for the new session

### Requirement: Sanitized and raw event views
The debug registry SHALL distinguish sanitized event data from optional raw event data. Query results SHALL return sanitized data by default. Raw data SHALL be returned only when the caller explicitly requests raw data and raw access is permitted by the active debug configuration.

#### Scenario: Sanitized default query
- **WHEN** a debug event contains raw data with a shell command and sanitized data with a redacted command
- **THEN** a default query returns the redacted command
- **AND** the default query does not include raw data

#### Scenario: Raw query permitted
- **WHEN** raw agent access is enabled and the caller explicitly requests raw data
- **THEN** matching query results include raw event data when it is available

#### Scenario: Raw query denied
- **WHEN** raw agent access is disabled and the caller explicitly requests raw data
- **THEN** matching query results omit raw event data
- **AND** the result indicates that raw access was denied

### Requirement: Best-effort redaction
The debug facility SHALL provide a reusable best-effort redaction helper that masks common secret-bearing keys and command fragments before data is exposed in sanitized results.

#### Scenario: Secret-like data is redacted
- **WHEN** event data contains keys such as `token`, `password`, `apiKey`, or `authorization`
- **THEN** sanitized output masks those values

#### Scenario: Non-secret data remains readable
- **WHEN** event data contains non-secret values such as `cwd`, `reason`, `durationMs`, and `timeoutMs`
- **THEN** sanitized output preserves those values

### Requirement: Debug settings
The `supi-debug` extension SHALL register a config-backed settings section with `/supi-settings` for `enabled`, `agentAccess`, `maxEvents`, and `notifyLevel`.

#### Scenario: Settings are visible
- **WHEN** the user opens `/supi-settings`
- **THEN** a `Debug` section appears with controls for enabling debugging, agent access, maximum retained events, and notification level

#### Scenario: Debugging toggled off
- **WHEN** the user sets debug `enabled` to `off`
- **THEN** subsequently recorded debug events are not retained

#### Scenario: Agent access setting changed
- **WHEN** the user changes `agentAccess` to `off`, `sanitized`, or `raw`
- **THEN** the `supi_debug` tool enforces that access mode for future calls

### Requirement: Debug context provider summary
The `supi-debug` extension SHALL register a context provider that exposes aggregate debug counts only. The summary SHALL NOT include individual event payloads, raw commands, or raw data.

#### Scenario: Debug events are present
- **WHEN** debug events have been recorded and `/supi-context` renders registered context providers
- **THEN** the debug provider section shows aggregate counts such as total events and counts by level or source

#### Scenario: No debug events are present
- **WHEN** no debug events have been recorded
- **THEN** the debug context provider returns `null`

### Requirement: User debug command
The `supi-debug` extension SHALL register a `/supi-debug` command that displays recent debug events to the user. The command SHALL show sanitized event data by default and SHALL indicate when debugging is disabled or no events match the requested filters.

#### Scenario: User views recent events
- **WHEN** the user runs `/supi-debug` after debug events have been recorded
- **THEN** the chat shows a debug report listing recent events with timestamp, source, level, category, message, and sanitized data

#### Scenario: Debugging disabled message
- **WHEN** the user runs `/supi-debug` while debugging is disabled
- **THEN** the command reports that debugging is disabled and points the user to `/supi-settings`

#### Scenario: No matching events
- **WHEN** the user runs `/supi-debug` with filters that match no retained events
- **THEN** the command reports that no matching debug events are available

### Requirement: Agent debug tool
The `supi-debug` extension SHALL register an agent-callable `supi_debug` tool that returns retained debug events according to filters and active access settings. The tool SHALL default to sanitized results and SHALL support filters for source, level, category, and limit.

#### Scenario: Agent fetches sanitized debug events
- **WHEN** agent access is `sanitized` and the agent calls `supi_debug` without requesting raw data
- **THEN** the tool returns matching sanitized debug events

#### Scenario: Agent access disabled
- **WHEN** agent access is `off` and the agent calls `supi_debug`
- **THEN** the tool returns an error or explanatory result indicating that agent debug access is disabled

#### Scenario: Agent requests raw data without permission
- **WHEN** agent access is `sanitized` and the agent calls `supi_debug` with `includeRaw: true`
- **THEN** the tool returns sanitized events only
- **AND** the result indicates that raw debug access is not enabled

#### Scenario: Agent requests raw data with permission
- **WHEN** agent access is `raw` and the agent calls `supi_debug` with `includeRaw: true`
- **THEN** the tool returns matching events including raw data when available

### Requirement: Meta-package integration
The `supi-debug` extension SHALL be wired into the workspace root and the `supi` meta-package so local-path and package installs can load it with the rest of the SuPi extension stack.

#### Scenario: Extension loads via workspace root
- **WHEN** a developer runs pi from the workspace root
- **THEN** the `supi-debug` extension is included in the root `pi.extensions` list

#### Scenario: Extension loads via meta-package
- **WHEN** a user installs `@mrclrchtr/supi`
- **THEN** the `supi-debug` extension is available with the bundled SuPi stack
