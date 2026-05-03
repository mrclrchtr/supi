## Context

Pi's `AssistantMessage.usage` provides `cacheRead`, `cacheWrite`, and `input` token counts per LLM response. The built-in footer shows cumulative session totals (`R12k W8k`) but provides no per-turn interpretation, trend visibility, or regression alerting. Users cannot tell whether prompt caching is working effectively without manually inspecting raw numbers.

The supi extension ecosystem already follows an established pattern: workspace packages under `packages/`, peer deps on pi core, settings via `registerConfigSettings` from supi-core, meta-package wiring via re-export entrypoints in `packages/supi/`. The existing `supi-context` package provides a related but orthogonal on-demand context snapshot — cache monitoring is a continuous tracking concern with different runtime characteristics.

## Goals / Non-Goals

**Goals:**
- Provide live, at-a-glance cache health via a compact footer status line
- Detect cache regressions (significant hit rate drops) and proactively notify with diagnosed probable cause
- Offer on-demand `/supi-cache` history for drill-down inspection
- Persist per-turn cache records in the session for history across pi restarts
- Follow supi conventions: workspace package, config settings, meta-package integration

**Non-Goals:**
- No cost/savings calculations — purely cache health, not financial analysis
- No custom footer replacement — uses `setStatus` to share footer space with other extensions
- No `before_provider_request` payload inspection — works from normalized usage data only
- No provider-specific logic — treats all providers uniformly via pi's normalized `Usage` type

## Decisions

### 1. Per-turn state model

**Decision:** Track `{ turnIndex, cacheRead, cacheWrite, input, hitRate, timestamp }` per assistant turn.

**Rationale:** This is the minimal set needed to compute hit rate, detect regressions, and render the history table. `hitRate = cacheRead / (cacheRead + input)` is the single key metric; when both `cacheRead` and `input` are 0 the hit rate is `undefined` (no data). `cacheWrite` is tracked for the history table (shows cache warm-up) but not used in regression detection. Assistant messages with missing or undefined `usage` are skipped (some providers/error responses may omit it).

**Alternative considered:** Track a rolling window average instead of per-turn records. Rejected because individual turn visibility is needed for the `/supi-cache` table and for diagnosing exactly when a regression started.

### 2. Regression detection via cause tracking

**Decision:** Listen to `session_compact`, `model_select`, and `before_agent_start` (system prompt hash) events to flag cache-invalidating causes. When hit rate drops >25 percentage points vs previous turn, emit a warning notification with the diagnosed cause.

**Rationale:** These three events cover the primary reasons caching breaks:
- Compaction reshuffles context → cache invalidated
- Model switch → different provider/model cache namespace
- System prompt change → prefix mismatch invalidates cache

Hashing the full system prompt on `before_agent_start` detects prompt mutations from any source (extensions, user config changes, skill loading) without needing to track each individually. A fast non-crypto hash is sufficient since this runs every turn and the prompt can be 10–50 KB+. The hash is compared between consecutive turns (not against a fixed baseline), so dynamic extensions that produce stable per-turn output do not cause false positives.

**Alternative considered:** Use `before_provider_request` to inspect the actual payload for cache control markers. Rejected — adds complexity, is provider-specific, and the normalized usage data already tells us whether caching worked via the result.

### 3. Session persistence via `pi.appendEntry()`

**Decision:** Persist per-turn cache records as custom session entries (`pi.appendEntry("supi-cache-turn", data)`). Reconstruct state from entries on `session_start`.

**Rationale:** User explicitly requested history across pi restarts. `appendEntry` is the pi-native mechanism for non-LLM session state. Each turn adds one small JSON entry — minimal session file overhead.

**Alternative considered:** In-memory only. Simpler but loses history on restart, which was a stated requirement.

### 4. Footer status via `setStatus`

**Decision:** Use `ctx.ui.setStatus("supi-cache", text)` to show a compact `cache: 87% ↑` indicator.

**Rationale:** `setStatus` adds to the footer without replacing the built-in footer. Other supi extensions (e.g., `supi-lsp`) already use this pattern. The status is compact enough to coexist with other status entries.

**Alternative considered:** Widget above editor. Rejected — too prominent for an ambient monitoring signal; footer status is the right visibility level.

### 5. Settings via `registerConfigSettings`

**Decision:** Three settings: `enabled` (on/off), `notifications` (on/off), `regressionThreshold` (percentage, default 25).

**Rationale:** Follows the pattern established by `supi-claude-md` and `supi-lsp`. Users can disable the extension entirely, silence notifications while keeping the status line, or adjust sensitivity. The threshold is the percentage-point drop that triggers a warning (e.g., 25 means 90%→65% triggers, but 90%→70% does not). A 25pp default catches meaningful regressions early — cache effectiveness is already severely degraded at a 20–30pp drop.

### 6. Package structure

**Decision:** `packages/supi-cache-monitor/` with files: `index.ts` (extension factory + event wiring), `state.ts` (per-turn history + cause tracking + regression detection), `status.ts` (footer formatting), `report.ts` (`/supi-cache` command output), `config.ts` (config type + defaults), `settings-registration.ts` (settings wiring).

**Rationale:** Follows the file-per-concern pattern of existing supi packages. Keeps `index.ts` as a thin orchestration layer wiring events to state/UI modules.

## Risks / Trade-offs

- **[Risk] First turn always shows 0% hit rate** → Annotate as "cold start" in the history table; suppress regression warning for the first turn of a session.
- **[Risk] Providers that don't report cache tokens** → When `cacheRead === 0 && cacheWrite === 0 && input > 0`, show `cache: —` instead of `cache: 0%` to distinguish "no cache data" from "cache miss". Track a `cacheSupported` flag based on whether any turn has ever reported non-zero cache values.
- **[Risk] System prompt hash changes on every turn due to dynamic extensions** → Hash the full system prompt text using a fast non-crypto hash. Require the hash to change between consecutive turns (not just differ from some baseline) to flag it as a cause. Dynamic extensions that produce stable per-turn output do not trigger false positives.
- **[Risk] Division by zero when both `cacheRead` and `input` are 0** → Treat `hitRate` as `undefined` (no data); display `cache: —` and skip regression detection for that turn.
- **[Risk] Assistant message with missing/undefined `usage`** → Some providers or error responses may omit `usage`. Skip turn recording when `usage` is not present.
- **[Risk] Session file growth from per-turn entries** → Each entry is ~100 bytes JSON. At 50 turns/session, that's ~5KB — negligible vs typical session sizes.
- **[Risk] `message_end` fires for user, assistant, AND toolResult messages** → Filter to `event.message.role === "assistant"` only, since only assistant messages carry `usage` data. Type-narrow to `AssistantMessage` before accessing `usage`.
