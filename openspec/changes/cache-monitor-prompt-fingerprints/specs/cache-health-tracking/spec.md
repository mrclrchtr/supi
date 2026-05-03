## ADDED Requirements

### Requirement: Prompt fingerprint computation
The extension SHALL compute a `PromptFingerprint` on every `before_agent_start` event by hashing each component of `event.systemPromptOptions`. The fingerprint SHALL contain:
- `customPromptHash`: hash of `customPrompt` text, or `0` if absent
- `appendSystemPromptHash`: hash of `appendSystemPrompt` text, or `0` if absent
- `promptGuidelinesHash`: hash of joined `promptGuidelines` array, or `0` if absent
- `selectedToolsHash`: hash of sorted `selectedTools` array joined by comma, or `0` if absent
- `toolSnippetsHash`: hash of joined `toolSnippets` values, or `0` if absent
- `contextFiles`: array of `{ path, hash }` for each context file, preserving order
- `skills`: array of `{ name, hash }` for each skill, preserving order

#### Scenario: Fingerprint computed from structured options
- **WHEN** a `before_agent_start` event fires with `systemPromptOptions` containing `selectedTools: ["read", "bash"]`, `contextFiles: [{ path: "AGENTS.md", content: "..." }]`, and `skills: [{ name: "test", ... }]`
- **THEN** the computed fingerprint has non-zero hashes for `selectedTools`, `contextFiles`, and `skills`, and zero for absent fields like `customPrompt`

#### Scenario: Fingerprint is stable for identical options
- **WHEN** two consecutive `before_agent_start` events provide identical `systemPromptOptions`
- **THEN** both computed fingerprints are deep-equal

### Requirement: Prompt fingerprint persistence
The extension SHALL attach the most recent `PromptFingerprint` to every `TurnRecord` in a `promptFingerprint` field. The fingerprint SHALL be captured at `recordTurn` time from the last computed fingerprint held in `CacheMonitorState`.

#### Scenario: Turn record includes fingerprint
- **WHEN** a turn is recorded after a `before_agent_start` event computed a fingerprint
- **THEN** the stored turn record contains a `promptFingerprint` object matching that fingerprint

#### Scenario: Fingerprint survives session restart
- **WHEN** a session is resumed and turn records are restored from `supi-cache-turn` entries that contain `promptFingerprint`
- **THEN** the in-memory turn history includes the restored fingerprints

### Requirement: Prompt fingerprint diffing
The extension SHALL provide a `diffFingerprints(prev, curr)` function that compares two `PromptFingerprint` objects and returns a list of human-readable change descriptions. Changes SHALL be reported as:
- `contextFiles (+N, ~M, -K)` for added, modified, and removed files
- `skills (+N, ~M, -K)` for added, modified, and removed skills
- `tools` when `selectedToolsHash` or `toolSnippetsHash` differs
- `guidelines` when `promptGuidelinesHash` differs
- `customPrompt` when `customPromptHash` differs
- `appendText` when `appendSystemPromptHash` differs

#### Scenario: Diff detects added context file
- **WHEN** `diffFingerprints` is called with a previous fingerprint having 1 context file and a current fingerprint having 2 context files
- **THEN** the result contains `"contextFiles (+1)"`

#### Scenario: Diff detects modified tool set
- **WHEN** `diffFingerprints` is called with two fingerprints whose `selectedToolsHash` differ but all other scalar hashes are equal
- **THEN** the result contains exactly `["tools"]`

#### Scenario: Diff with identical fingerprints
- **WHEN** `diffFingerprints` is called with two identical fingerprints
- **THEN** the result is an empty array

## MODIFIED Requirements

### Requirement: Regression detection with cause diagnosis
The extension SHALL detect cache regressions by comparing the current turn's hit rate to the previous turn's hit rate. A regression is detected when the hit rate drops by more than the configured `regressionThreshold` percentage points. Turns with `undefined` hit rate SHALL be excluded from regression detection. The extension SHALL track potential causes: compaction (via `session_compact`), model change (via `model_select`), and system prompt change (via granular fingerprint comparison on `before_agent_start`).

#### Scenario: Regression after system prompt change
- **WHEN** the `promptFingerprint` changes between consecutive comparable turns and the next assistant turn has a hit rate drop exceeding the threshold
- **THEN** a warning notification is emitted: `Cache regression: <prev>% → <current>%. Likely cause: system prompt changed (<diff-list>)` where `<diff-list>` is a comma-separated list of changed components (e.g. `contextFiles (+1), tools`)

### Requirement: Cache history command
The extension SHALL register a `/supi-cache` command that displays a per-turn history table. The table SHALL include columns: Turn, Input, CacheR, CacheW, Hit%, and Note. The Note column SHALL annotate turns with: `cold start` for the first turn, `⚠ compaction` when a compaction caused the regression, `⚠ model changed` for model switches, `⚠ prompt changed` for system prompt changes, and `⚠ unknown` for unexplained regressions. Below the table, the extension SHALL display a "Regression details" section for any turn whose note indicates a regression cause. Each detail entry SHALL list the turn index, the hit-rate drop, and the fingerprint diff bullet points for `prompt_change` regressions.

#### Scenario: History table with regression details
- **WHEN** the user runs `/supi-cache` and there is a turn with a `prompt_change` regression cause and a fingerprint diff of `["contextFiles (+1)"]`
- **THEN** below the history table a "Regression details" section is shown containing: `Turn 3: 80% → 5%` followed by `• contextFiles (+1)`
