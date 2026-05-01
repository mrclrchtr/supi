## Context

The `supi-claude-md` extension injects context files (CLAUDE.md, AGENTS.md) into the LLM conversation at two points:

1. **Root refresh** (`before_agent_start`): Re-injects root-level context files every N turns (default 3)
2. **Subdirectory injection** (`tool_result`): Appends subdirectory context to tool results when the agent accesses files in a new directory

Both injection paths use a pure turn-based schedule. They don't consider how full the context window already is. Pi provides `ctx.getContextUsage()` which returns `{ tokens: number | null, contextWindow: number, percent: number | null }` — this is available in event handlers and can inform injection decisions.

Current config shape (`claude-md` section in supi config):
```json
{
  "rereadInterval": 3,
  "subdirs": true,
  "fileNames": ["CLAUDE.md", "AGENTS.md"]
}
```

## Goals / Non-Goals

**Goals:**
- Skip root refresh when context window usage exceeds a configurable threshold
- Skip subdirectory re-injection (already-seen dirs) when context exceeds the threshold, while still allowing first-time discoveries
- Make the threshold configurable via the existing `/supi-settings` UI
- Gracefully handle `getContextUsage()` returning `null` (after compaction, before first LLM response)

**Non-Goals:**
- Proactively triggering compaction based on context usage (separate concern)
- Changing the turn-based `rereadInterval` mechanism itself
- Injecting different amounts of content based on context pressure (just skip or don't skip)
- First-time subdirectory injection gating (always inject first-time context — the agent needs it for the current operation)

## Decisions

### Decision 1: Add `contextThreshold` config field (0–100, default 80)

A percentage threshold. When `getContextUsage().percent >= contextThreshold`, skip injection. Default 80 means context injection pauses when 80%+ of the window is consumed.

**Why percentage over absolute tokens?** Different models have different context windows (8k to 1M+). A percentage normalizes across models without requiring per-model config.

**Why 80% as default?** Below 80% there's typically still enough room for productive injection. Above 80%, the marginal value of adding more context drops fast — the model has less room to reason and compaction is more likely to discard the freshly injected content immediately.

### Decision 2: Pass context usage into existing decision functions

Add an optional `contextUsage` parameter to `shouldRefreshRoot()` and `shouldInjectSubdir()`. The calling code in `index.ts` calls `ctx.getContextUsage()` and passes the result down. This keeps the decision functions pure and testable.

**Alternative considered**: Check `getContextUsage()` inside the functions. Rejected because they're in separate modules without access to `ctx`.

### Decision 3: `null` tokens treated as "not full" (allow injection)

When `getContextUsage()` returns `null` (e.g., right after compaction), or when `percent` is `null`, assume context is not full and proceed with injection. This is the safe default — after compaction, context is typically small, so injection is desirable.

### Decision 4: First-time subdirectory injection always allowed

A directory the agent has never visited before gets its context injected regardless of context pressure. The agent likely needs that context to process the current operation. Only re-injections (already-seen dirs due for a refresh) are gated by the threshold.

### Decision 5: Setting exposed as `contextThreshold` in the `claude-md` section

Consistent with existing config layout. The settings UI shows it as a percentage slider/selector.

## Risks / Trade-offs

- **[Over-skipping on short-context models]** Models with small context windows (8k) might hit 80% very early, preventing useful re-injections. → Mitigation: `contextThreshold` is configurable; users with small models can raise it to 95 or set to 100 (disabled).
- **[Stale percentage after compaction]** After compaction, `tokens` is `null` and `percent` is `null` until the next LLM response. → Mitigation: treat `null` as "not full" — injection proceeds, which is correct since context was just freed.
- **[Threshold timing]** The percentage is read at `before_agent_start` time, before the current turn's messages are added. The actual usage at LLM call time will be slightly higher. → Mitigation: conservative 80% default gives enough headroom that a few percent difference doesn't matter.