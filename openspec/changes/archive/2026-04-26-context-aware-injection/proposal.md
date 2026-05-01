## Why

The claude-md extension re-injects root and subdirectory context on a fixed turn interval (default: every 3 turns) regardless of how full the context window is. When context is already near capacity, these injections waste tokens on content that will likely be compacted away moments later, and they push the session closer to truncation where the model loses earlier important context.

## What Changes

- Add context-usage awareness to root refresh: skip periodic re-injection when context window usage exceeds a configurable threshold (default 80%)
- Add context-usage awareness to subdirectory injection: skip re-injection of already-seen directories when context is above threshold (still inject first-time discoveries regardless)
- Add a new config option `contextThreshold` (0–100, default 80) controlling the percentage threshold above which refresh/re-injection is suppressed
- Expose the threshold in the `/supi-settings` UI

## Capabilities

### New Capabilities

- `context-aware-injection`: Skip context injection (root refresh and subdirectory re-injection) when the context window usage exceeds a configurable threshold. First-time subdirectory discovery is always allowed since it provides needed context for the current operation.

### Modified Capabilities

- `root-refresh-dedup`: `shouldRefreshRoot()` gains an additional condition — return false when context usage is above threshold (even if turn count says it's time to refresh)