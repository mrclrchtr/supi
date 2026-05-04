# Prompt Cache Forensics — Cross-Session Cache-Miss Investigation

## Goal
Enable analysis of past PI sessions in a *new* session to identify patterns in prompt cache regressions, correlate them with tool usage, and improve SuPi tools.

> Example question: *"Show me all sessions in the last week where cache hit rate regressed after a specific tool call pattern."*

---

## Current Capabilities

| Component | What it captures | Persistence | Cross-session? |
|---|---|---|---|
| **supi-cache-monitor** | Per-turn `cacheRead`/`cacheWrite`/`hitRate`, regression causes (`compaction`, `model_change`, `prompt_change`) | `pi.appendEntry("supi-cache-turn")` inside session file | ❌ opaque to other sessions |
| **supi-debug** | Extension diagnostic events (`source`, `level`, `category`, `message`) | In-memory `globalThis` registry, cleared on `session_start` | ❌ ephemeral |
| **supi-insights** | Session metadata scanner (`SessionManager.listAll()`), parser (`parseSessionFile()`), branch resolution (`getActiveBranchEntries()`), tool stats | Reads any session file on demand | ✅ full history accessible |

---

## Two Options Considered

### Option A: Shared NDJSON Datasink
Write curated events to `~/.pi/agent/supi/sink/*.ndjson`.

**Pros**
- Fast aggregate queries (streaming filter, no JSONL parse)
- Safer agent exposure (only pre-approved, redacted shapes)
- Good for dashboards and alerts

**Cons**
- Retroactive data loss: only captures from when enabled
- Duplicates source of truth
- Adds storage, retention, and privacy management

### Option B: Session-File Forensics API
Generalize `supi-insights` parsing primitives into reusable utilities and build on-demand analysis.

**Pros**
- Immediate access to full historical session data
- No new storage layer
- Deep causal context (full tool args, message flow, compaction events)

**Cons**
- Slower for aggregate queries over 100s of sessions
- Agent exposure requires careful redaction boundaries

---

## Recommendation: Two-Tier Architecture

Start with **Tier 1** (session-file API). Add **Tier 2** (shared sink) later only if scan performance becomes a real bottleneck.

### Tier 1 — Session-File Forensics (deep, on-demand)

Extract and generalize proven primitives from `supi-insights`:

- `parseSessionFile(path)` → `FileEntry[]`
- `getActiveBranchEntries(entries)` → `SessionEntry[]` (resolves active branch from append-only tree)
- `extractCacheTurns(branch)` → `CacheTurn[]` (pulls `cacheRead`/`cacheWrite`/`input` from assistant `message_end` usage)
- `extractToolCalls(branch, turnRange?)` → `ToolCall[]`
- `hasCompactionEvent(branch, beforeTurn?)` → `boolean`
- `hasModelChange(branch, beforeTurn?)` → `boolean`

Build a `supi_cache_forensics` tool:
- Scans `SessionManager.listAll()` for recent sessions
- Walks each session's active branch
- Detects regressions (`hitRate` drop > threshold)
- Returns structured correlations: `turn`, `drop`, `toolsBefore`, `compacted`, `modelSwitched`, `sessionId`

This is agent-callable so the user can ask natural questions like *"Why did my cache hit rate drop in the last 3 sessions?"*

### Tier 2 — Lightweight Shared Sink (aggregate, always-on) *[future]*

Only if Tier 1 scans become too slow for real-time queries:

- `supi-cache-monitor` writes minimal `cache-turn` events to `~/.pi/agent/supi/sink/cache.ndjson`
- `supi-debug` optionally writes `debug` events to `~/.pi/agent/supi/sink/debug.ndjson`
- New `/supi-cache-trends` command for fast aggregate queries (e.g., average hit rate by model this week)

The sink becomes a **materialized view**, not the source of truth.

---

## Information Worth Capturing (for forensics)

### Common envelope (every correlation result)
```json
{
  "sid": "<session-id>",
  "turn": 7,
  "ts": 1714500000123,
  "repo": "/abs/path/to/repo",
  "model": "anthropic/claude-3-7-sonnet-20250219"
}
```

### Event types to correlate

| Type | Source | Use |
|---|---|---|
| `cache-turn` | `supi-cache-monitor` | Outcome: `cacheRead`, `cacheWrite`, `input`, `hitRate`, `cause` |
| `tool-call` | Session file `message` entries | Action: `toolName`, `paramSummary` (shape fingerprint, redacted), `resultStatus`, `durationMs` |
| `tool-batch` | Derived per-turn summary | Turn-level: `toolCount`, `distinctToolNames`, `errorCount`, `totalResultTokens` |
| `context-snapshot` | `before_agent_start` event | Prompt state: `systemPromptHash`, `contextMessageCount`, `customContextTypes` |
| `debug` | `supi-debug` | Extension diagnostics: `source`, `level`, `category`, `message` |
| `session-lifecycle` | `session_compact`, `model_select` | Boundaries: `event` (`start`\|`compact`\|`model_switch`\|`shutdown`), `previousModel`/`newModel` |

### Query pattern: tool calls before a regression
```
1. Find cache-turn entries with cause != null in date range
2. For each regression, load the same session's branch
3. Extract tool calls from turns [N-2, N-1, N]
4. Extract lifecycle events (compact, model_switch) in the same window
5. Emit: regression correlated with tool pattern X, compact at N-1, model switch at N-2, etc.
```

### What to intentionally NOT capture
- Full raw tool args / results — too large and risky
- Full system prompt text — hash only
- File contents — repo-relative paths or basenames at most

---

## Implementation Plan

### Phase 1: Extract shared session utilities
- Move `parseSessionFile`, `getActiveBranchEntries`, and type shims from `supi-insights/src/parser.ts` into `supi-core` (or a new `supi-session-utils` package)
- Ensure backward compatibility with `supi-insights`

### Phase 2: Build cache forensics module
- New file in `supi-cache-monitor` or `supi-insights`: `forensics.ts`
- Functions: `findRegressions()`, `correlateToolsBeforeTurn()`, `formatForensicsReport()`
- Redaction helpers for tool param summaries (reuse `supi-debug` secret regexes)

### Phase 3: Agent-facing tool
- Register `supi_cache_forensics` tool with parameters: `dateRange`, `regressionThreshold`, `includeToolDetails`
- Returns structured JSON (not just text) so the agent can reason over correlations

### Phase 4: User-facing command
- `/supi-cache-forensics` command with optional filters (`since=3d`, `tool=bash`, `model=claude-sonnet`)
- Render as themed TUI report or custom message

### Phase 5: Evaluate ( Tier 2 gate)
- If scanning 200+ session files is too slow for interactive use, spec out Tier 2 (shared NDJSON sink)
- Otherwise, stop at Tier 1

---

## Open Questions

1. **Where do shared session parsing utilities live?** `supi-core` (already a shared lib) vs. new `supi-session-utils` package.
2. **Redaction boundary**: Should forensics only see tool *names* and *counts*, or also param shape fingerprints? The latter is more useful but needs careful sanitization.
3. **Performance budget**: How many sessions should `supi_cache_forensics` scan by default? `supi-insights` caps at 200 with batching.
4. **Privacy default**: Should the tool be opt-in via `/supi-settings`, or enabled by default with a `maxSessions` limit?
