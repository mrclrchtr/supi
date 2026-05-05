## Why

The cache monitor regression warning says “system prompt changed” but gives no detail about *what* changed. Users cannot tell whether a new tool, a changed `AGENTS.md`, a skill load, or an appended prompt caused the cache drop, making the diagnosis opaque and hard to act on.

## What Changes

- Compute a granular `PromptFingerprint` from `BuildSystemPromptOptions` on every `before_agent_start`.
- Attach the fingerprint to each `TurnRecord` so it is persisted in session entries.
- Diff fingerprints when a `prompt_change` regression is detected and surface a compact diff in the warning notification.
- Enrich the `/supi-cache` report with a regression-details section showing per-regression fingerprint diffs.
- Add unit tests for fingerprint computation, diffing, and integration with turn recording.

## Capabilities

### New Capabilities
- *(none)*

### Modified Capabilities
- `cache-health-tracking`: Regression diagnosis and history reporting now expose granular prompt-component diffs (context files, tools, skills, guidelines, custom prompt, append text) instead of a single opaque “system prompt changed” cause.

## Impact

- Affected package: `packages/supi-cache-monitor` (new `fingerprint.ts`, changes to `state.ts`, `cache-monitor.ts`, `report.ts`, and tests).
- No breaking changes to existing settings, commands, or persisted entry format beyond the addition of the new `promptFingerprint` field (old entries without it are ignored).
