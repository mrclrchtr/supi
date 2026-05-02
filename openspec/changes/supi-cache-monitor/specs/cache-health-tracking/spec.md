## ADDED Requirements

### Requirement: Per-turn cache metric collection
The extension SHALL record cache metrics for each assistant message by listening to `message_end` events. For each assistant message with a defined `usage` object, it SHALL compute and store: `turnIndex`, `cacheRead`, `cacheWrite`, `input`, `hitRate` (= `cacheRead / (cacheRead + input)`, or `undefined` when both are 0), and `timestamp`. Non-assistant messages and assistant messages with missing/undefined `usage` SHALL be ignored.

#### Scenario: Normal assistant message with cache data
- **WHEN** a `message_end` event fires with `event.message.role === "assistant"` and `usage.cacheRead > 0`
- **THEN** a turn record is stored with the correct `hitRate` computed as `cacheRead / (cacheRead + input)`

#### Scenario: Assistant message with zero cache tokens
- **WHEN** a `message_end` event fires with `event.message.role === "assistant"` and `usage.cacheRead === 0` and `usage.cacheWrite === 0` and `usage.input > 0`
- **THEN** a turn record is stored with `hitRate` of `0` and the turn is flagged as having no cache data

#### Scenario: Assistant message with both cacheRead and input equal to zero
- **WHEN** a `message_end` event fires with `event.message.role === "assistant"` and `usage.cacheRead === 0` and `usage.input === 0`
- **THEN** a turn record is stored with `hitRate` of `undefined` (no data), and the turn is excluded from regression detection

#### Scenario: Assistant message with missing usage
- **WHEN** a `message_end` event fires with `event.message.role === "assistant"` and `event.message.usage` is `undefined`
- **THEN** no turn record is created

#### Scenario: Non-assistant message
- **WHEN** a `message_end` event fires with `event.message.role === "user"` or `event.message.role === "toolResult"`
- **THEN** no turn record is created

### Requirement: Session-persisted turn history
The extension SHALL persist each turn record to the session via `pi.appendEntry("supi-cache-turn", data)`. On `session_start`, the extension SHALL reconstruct its in-memory turn history from all session entries with `type === "custom"` and `customType === "supi-cache-turn"`.

#### Scenario: Turn record persisted
- **WHEN** a new turn record is created from a `message_end` event
- **THEN** `pi.appendEntry("supi-cache-turn", turnRecord)` is called

#### Scenario: History restored on session start
- **WHEN** a `session_start` event fires and the session contains custom entries with `customType === "supi-cache-turn"`
- **THEN** the in-memory turn history is reconstructed from those entries in order

#### Scenario: Fresh session with no cache entries
- **WHEN** a `session_start` event fires and the session contains no `supi-cache-turn` entries
- **THEN** the in-memory turn history starts empty

### Requirement: Footer status line
The extension SHALL display a compact cache status in the footer via `ctx.ui.setStatus("supi-cache", text)` after each assistant turn. The format SHALL be `cache: <hitRate>% <trend>` where `<trend>` is `↑` when hit rate increased vs previous turn, `↓` when decreased, and omitted when unchanged or first turn.

#### Scenario: Cache hit rate displayed after turn
- **WHEN** an assistant turn completes with `hitRate` of 87% and previous turn was 82%
- **THEN** the footer status shows `cache: 87% ↑`

#### Scenario: First turn of session
- **WHEN** the first assistant turn completes with `hitRate` of 0% (cold start)
- **THEN** the footer status shows `cache: 0%` with no trend arrow

#### Scenario: Provider reports no cache tokens
- **WHEN** an assistant turn completes with `cacheRead === 0`, `cacheWrite === 0`, and this is not the first turn, and no prior turn has reported non-zero cache values
- **THEN** the footer status shows `cache: —` to indicate cache data is unavailable

#### Scenario: Turn with undefined hitRate (zero denominator)
- **WHEN** an assistant turn completes with `hitRate` of `undefined` (both `cacheRead` and `input` were 0)
- **THEN** the footer status shows `cache: —`

#### Scenario: Extension disabled
- **WHEN** the `enabled` setting is `off`
- **THEN** no footer status is displayed and `setStatus("supi-cache", undefined)` clears any prior status

### Requirement: Regression detection with cause diagnosis
The extension SHALL detect cache regressions by comparing the current turn's hit rate to the previous turn's hit rate. A regression is detected when the hit rate drops by more than the configured `regressionThreshold` percentage points. Turns with `undefined` hit rate SHALL be excluded from regression detection. The extension SHALL track potential causes: compaction (via `session_compact`), model change (via `model_select`), and system prompt change (via full system prompt hash comparison on `before_agent_start`).

#### Scenario: Regression after compaction
- **WHEN** a `session_compact` event fires and the next assistant turn has a hit rate drop exceeding the threshold
- **THEN** a warning notification is emitted: `Cache regression: <prev>% → <current>%. Likely cause: compaction`

#### Scenario: Regression after model change
- **WHEN** a `model_select` event fires and the next assistant turn has a hit rate drop exceeding the threshold
- **THEN** a warning notification is emitted: `Cache regression: <prev>% → <current>%. Likely cause: model changed to <provider>/<modelId>`

#### Scenario: Regression after system prompt change
- **WHEN** the system prompt hash changes between consecutive `before_agent_start` calls and the next assistant turn has a hit rate drop exceeding the threshold
- **THEN** a warning notification is emitted: `Cache regression: <prev>% → <current>%. Likely cause: system prompt changed`

#### Scenario: Regression with unknown cause
- **WHEN** a hit rate drop exceeding the threshold occurs with no recent compaction, model change, or system prompt change
- **THEN** a warning notification is emitted: `Cache regression: <prev>% → <current>%. Cause unknown`

#### Scenario: First turn suppresses regression warning
- **WHEN** the first assistant turn of a session has 0% hit rate
- **THEN** no regression warning is emitted (cold start is expected)

#### Scenario: Notifications disabled
- **WHEN** the `notifications` setting is `off` and a regression is detected
- **THEN** no warning notification is emitted, but the footer status still reflects the drop

### Requirement: Cache history command
The extension SHALL register a `/supi-cache` command that displays a per-turn history table. The table SHALL include columns: Turn, Input, CacheR, CacheW, Hit%, and Note. The Note column SHALL annotate turns with: `cold start` for the first turn, `⚠ compaction` when a compaction caused the regression, `⚠ model changed` for model switches, `⚠ prompt changed` for system prompt changes, and `⚠ unknown` for unexplained regressions.

#### Scenario: History table with multiple turns
- **WHEN** the user runs `/supi-cache` and there are 5 recorded turns
- **THEN** a table is displayed with 5 rows showing per-turn cache metrics and annotations

#### Scenario: No turns recorded
- **WHEN** the user runs `/supi-cache` and there are no recorded turns
- **THEN** a message is displayed: `No cache data yet — send a message to start tracking`

#### Scenario: History survives pi restart
- **WHEN** the user restarts pi, resumes the same session, and runs `/supi-cache`
- **THEN** the full turn history from before the restart is displayed (reconstructed from session entries via `ctx.sessionManager.getBranch()`)

### Requirement: Configurable settings
The extension SHALL register settings via `registerConfigSettings` from supi-core with the following items:
- `enabled`: on/off (default: on) — controls whether the extension tracks cache data and displays status
- `notifications`: on/off (default: on) — controls whether regression warning notifications are shown
- `regressionThreshold`: percentage-point drop that triggers a warning (default: 25)

#### Scenario: Default settings
- **WHEN** the extension loads with no user configuration
- **THEN** it operates with `enabled: on`, `notifications: on`, `regressionThreshold: 25`

#### Scenario: Adjusted threshold
- **WHEN** the user sets `regressionThreshold` to 15
- **THEN** a hit rate drop of 20 percentage points triggers a regression warning

#### Scenario: Extension disabled via settings
- **WHEN** the user sets `enabled` to `off`
- **THEN** no cache data is collected, no status is displayed, and no notifications are sent

### Requirement: Meta-package integration
The extension SHALL be wired into the `packages/supi/` meta-package via a re-export entrypoint file and added to the meta-package's `pi.extensions` manifest and `dependencies`.

#### Scenario: Extension loaded via supi meta-package
- **WHEN** a user installs the `supi` meta-package
- **THEN** the cache monitor extension is loaded automatically
