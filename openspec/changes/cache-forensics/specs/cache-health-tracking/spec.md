## MODIFIED Requirements

### Requirement: Cache history command
The extension SHALL register a `/supi-cache-history` command that displays a per-turn history table for the current session. The table SHALL include columns: Turn, Input, CacheR, CacheW, Hit%, and Note. The Note column SHALL annotate turns with: `cold start` for the first turn, `⚠ compaction` when a compaction caused the regression, `⚠ model changed` for model switches, `⚠ prompt changed` for system prompt changes, and `⚠ unknown` for unexplained regressions. Below the table, the extension SHALL display a "Regression details" section for any turn whose note indicates a regression cause. Each detail entry SHALL list the turn index, the hit-rate drop, and the fingerprint diff bullet points for `prompt_change` regressions. The extension SHALL also register a `/supi-cache-forensics` command for cross-session investigation and a `supi_cache_forensics` tool for agent-callable forensics queries.

#### Scenario: History table with multiple turns
- **WHEN** the user runs `/supi-cache-history` and there are 5 recorded turns
- **THEN** a table is displayed with 5 rows showing per-turn cache metrics and annotations

#### Scenario: No turns recorded
- **WHEN** the user runs `/supi-cache-history` and there are no recorded turns
- **THEN** a message is displayed: `No cache data yet — send a message to start tracking`

#### Scenario: History survives pi restart
- **WHEN** the user restarts pi, resumes the same session, and runs `/supi-cache-history`
- **THEN** the full turn history from before the restart is displayed (reconstructed from session entries via `ctx.sessionManager.getBranch()`)

### Requirement: Configurable settings
The extension SHALL register settings via `registerConfigSettings` from supi-core with the following items:
- `enabled`: on/off (default: on) — controls whether the extension tracks cache data and displays status
- `notifications`: on/off (default: on) — controls whether regression warning notifications are shown
- `regressionThreshold`: percentage-point drop that triggers a warning (default: 25)
- `idleThresholdMinutes`: minimum gap in minutes between turns to classify a regression as idle-time (default: 5)

#### Scenario: Default settings
- **WHEN** the extension loads with no user configuration
- **THEN** it operates with `enabled: on`, `notifications: on`, `regressionThreshold: 25`, `idleThresholdMinutes: 5`

#### Scenario: Adjusted threshold
- **WHEN** the user sets `regressionThreshold` to 15
- **THEN** a hit rate drop of 20 percentage points triggers a regression warning

#### Scenario: Extension disabled via settings
- **WHEN** the user sets `enabled` to `off`
- **THEN** no cache data is collected, no status is displayed, and no notifications are sent

### Requirement: Meta-package integration
The extension SHALL be wired into the `packages/supi/` meta-package via a re-export entrypoint file and added to the meta-package's `pi.extensions` manifest and `dependencies`. The package is named `@mrclrchtr/supi-cache`.

#### Scenario: Extension loaded via supi meta-package
- **WHEN** a user installs the `supi` meta-package
- **THEN** the cache extension is loaded automatically from the `supi-cache` package
