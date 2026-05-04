## ADDED Requirements

### Requirement: Session file scanning for cache turn data
The extension SHALL scan past session files to extract cache turn records via `SessionManager.listAll()`. For each session within the configured date range, it SHALL parse the session file using `parseSessionFile()`, resolve the active branch via `getActiveBranchEntries()`, and extract entries with `customType === "supi-cache-turn"` as `TurnRecord` objects. Sessions without any cache turn entries SHALL be skipped silently.

#### Scenario: Scan recent sessions for cache data
- **WHEN** the forensics engine scans sessions from the last 7 days
- **THEN** it returns only sessions that contain at least one `supi-cache-turn` custom entry, each with parsed `TurnRecord` objects

#### Scenario: Session has messages but no cache data
- **WHEN** a session file contains message entries but no `supi-cache-turn` custom entries
- **THEN** that session is excluded from the forensics result set

#### Scenario: Old session lacks prompt fingerprint
- **WHEN** a session contains `supi-cache-turn` entries without a `promptFingerprint` field
- **THEN** those entries are extracted normally with `promptFingerprint` as `undefined`

### Requirement: Regression hotspot detection
The forensics engine SHALL provide a hotspot detection query that ranks all regression turns across scanned sessions by hit-rate drop magnitude. A regression turn is any `TurnRecord` whose `note` field indicates a regression cause. The result SHALL include session ID, turn index, previous hit rate, current hit rate, drop percentage, and the diagnosed cause. Results SHALL be sorted by drop magnitude descending.

#### Scenario: Hotspots across multiple sessions
- **WHEN** the user runs hotspot detection on sessions from the last week and two sessions each have one regression turn (session A: 80%→15%, session B: 90%→85%)
- **THEN** the results are returned with session A's turn ranked first (65% drop) and session B's turn ranked second (5% drop)

#### Scenario: No regressions found
- **WHEN** the user runs hotspot detection but no session has any regression turn
- **THEN** an empty result set is returned with no error

### Requirement: Cause breakdown aggregation
The forensics engine SHALL provide a cause breakdown query that tallies regression causes across all scanned sessions. The tally SHALL include causes from the runtime `TurnRecord.cause` field (`compaction`, `model_change`, `prompt_change`, `unknown`) and a derived `idle` cause for any `unknown`-cause regression where the gap between the previous turn's timestamp and the current turn's timestamp exceeds the `idleThresholdMinutes` setting. The result SHALL be a mapping from cause type to count.

#### Scenario: Mixed causes across sessions
- **WHEN** 3 regressions have cause `prompt_change`, 2 have cause `compaction`, and 1 has cause `unknown` with a timestep gap exceeding 5 minutes
- **THEN** the breakdown shows `prompt_change: 3, compaction: 2, idle: 1`

#### Scenario: Unknown cause with short gap
- **WHEN** a regression has cause `unknown` and the timestamp gap to the previous turn is 5 minutes
- **THEN** the cause is tallied as `unknown`, not `idle`

### Requirement: Tool-cache correlation analysis
The forensics engine SHALL provide a tool correlation query that, for each regression turn, extracts the tool calls from the N preceding turns (default: N=2) within the same session's active branch. Tool calls SHALL be represented as shape fingerprints containing `toolName`, `paramKeys`, and per-parameter shapes (`kind`, `len`, `multiline` for strings). The result SHALL be a list of regressions each annotated with their preceding tool call shapes.

#### Scenario: Regression preceded by tool calls
- **WHEN** a regression turn at index 7 was preceded by a `bash` call at turn 6 and a `write` call at turn 5
- **THEN** the correlation result for that regression includes two `ToolCallShape` entries with `toolName: "bash"` and `toolName: "write"`, each with their param shapes

#### Scenario: Regression preceded by no tool calls
- **WHEN** a regression turn at index 3 was preceded by turns that contain only text responses and no tool calls
- **THEN** the correlation result for that regression includes an empty `toolsBefore` array

#### Scenario: Agent tool strips human-only detail
- **WHEN** the `supi_cache_forensics` tool returns correlation results to the agent
- **THEN** `_prefixed` fields (file paths, command summaries) are stripped from the output, leaving only shape fingerprints

### Requirement: Idle-time gap detection
The forensics engine SHALL detect idle-time cache expiry by computing the gap between consecutive `TurnRecord` timestamps. When a turn shows a hit-rate drop and its timestamp gap from the previous turn exceeds the `idleThresholdMinutes` setting, the finding SHALL be annotated with `cause: "idle"` and `idleGapMinutes`.

#### Scenario: Idle gap detected
- **WHEN** turn 5 has a 40-minute gap from turn 4 and shows a hit-rate drop from 80% to 10%
- **THEN** the forensics finding is annotated with `cause: "idle"` and `idleGapMinutes: 40`

#### Scenario: Gap below threshold
- **WHEN** turn 5 has a 3-minute gap from turn 4 and shows a hit-rate drop from 80% to 10% with cause `unknown`
- **THEN** the forensics finding retains `cause: "unknown"` and does not set `idleGapMinutes`

### Requirement: Agent-facing forensics tool
The extension SHALL register a `supi_cache_forensics` tool that accepts parameters `pattern` (one of `"hotspots"`, `"breakdown"`, `"correlate"`, `"idle"`), `since` (duration string like `"7d"`, `"24h"`, default `"7d"`), optional `minDrop` (minimum hit-rate drop to include, default 0), and optional `maxSessions` (maximum sessions to scan, default 100). The tool SHALL return structured JSON matching the `ForensicsFinding` type with agent-safe output (shape fingerprints for tool calls, no raw file paths or command text).

#### Scenario: Agent queries hotspots
- **WHEN** the agent calls `supi_cache_forensics({ pattern: "hotspots", since: "7d", minDrop: 20 })`
- **THEN** the tool returns a JSON array of `ForensicsFinding` objects with `sessionId`, `turnIndex`, `drop`, `cause`, and `toolsBefore` (as shape fingerprints)

#### Scenario: Agent respects maxSessions cap
- **WHEN** the agent calls `supi_cache_forensics({ pattern: "hotspots", since: "7d", maxSessions: 10 })` and 15 sessions exist in the date range
- **THEN** only the 10 most recent sessions are scanned

#### Scenario: Agent queries cause breakdown
- **WHEN** the agent calls `supi_cache_forensics({ pattern: "breakdown", since: "30d" })`
- **THEN** the tool returns a JSON object with cause-type keys and integer counts, including derived `idle` counts

### Requirement: User-facing forensics command
The extension SHALL register a `/supi-cache-forensics` command that accepts optional filters `--since`, `--pattern`, and `--tool`. The command SHALL render results as a themed TUI report via a custom message renderer. The renderer SHALL display richer detail than the agent tool, including file paths and command summaries for tool calls where available.

#### Scenario: User runs forensics command with defaults
- **WHEN** the user runs `/supi-cache-forensics`
- **THEN** a custom message is displayed showing the cause breakdown for the last 7 days, rendered as a themed table or chart

#### Scenario: User filters by pattern
- **WHEN** the user runs `/supi-cache-forensics --pattern hotspots --since 3d`
- **THEN** the custom message shows the top regression drops from the last 3 days with full detail (session ID, turn, hit rates, prompt diff if available, tool context)

### Requirement: Forensics config integration

The forensics queries SHALL use the same `regressionThreshold` from the existing cache monitor config. The idle-time threshold SHALL use the `idleThresholdMinutes` setting defined in `cache-health-tracking`.

#### Scenario: Forensics respects configured idle threshold
- **WHEN** the user sets `idleThresholdMinutes` to 15
- **THEN** timestamp gaps of 15 minutes or more are flagged as idle in forensics results
