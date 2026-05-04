## Context

`supi-cache-monitor` is a real-time extension that tracks per-turn cache metrics, detects regressions, and shows a footer status. It persists `TurnRecord` entries into the session file via `pi.appendEntry("supi-cache-turn", ...)`. These records contain `hitRate`, `cause`, `timestamp`, and (after the `cache-monitor-prompt-fingerprints` change lands) `promptFingerprint`.

`supi-insights` already provides cross-session primitives: `SessionManager.listAll()`, `parseSessionFile()`, `getActiveBranchEntries()`, and `extractToolStats()`. However, it only reads `message` entries and ignores `supi-cache-turn` custom entries entirely.

The goal is to bridge this gap: build a forensics layer that reads cache turn data from any session file and answers investigative questions about cache performance across sessions.

This change also renames the package from `supi-cache-monitor` to `supi-cache` to reflect its broader scope (both real-time monitoring and historical forensics).

## Goals / Non-Goals

**Goals:**
- Rename package `supi-cache-monitor` → `supi-cache` and reorganize internally into `monitor/`, `forensics/`, and `report/` subdirectories.
- Extract `getActiveBranchEntries()` into `supi-core` as a reusable session utility. Cache-specific extraction (`extractCacheTurnEntries`, `extractToolCallWindows`) lives in the forensics module.
- Build a forensics engine (`forensics/`) that scans past session files, extracts `TurnRecord` entries, and runs four query patterns: hotspots (A), cause breakdown (B), tool correlation (C), and idle-time detection (D).
- Register a `supi_cache_forensics` agent tool returning structured, redacted findings (shape fingerprints for tool calls, no raw content).
- Add a `/supi-cache-forensics` user command with a themed TUI report renderer.
- Rename `/supi-cache` → `/supi-cache-history` (same functionality).

**Non-Goals:**
- A shared NDJSON data sink (Tier 2 in the forensics investigation doc). Session-file scanning is sufficient for initial scope.
- Modifying the runtime monitoring behavior — footer status, regression detection, and per-turn tracking are unchanged.
- Real-time alerts or dashboards — forensics is on-demand investigation.
- Cryptographic hashing for fingerprints — FNV-1a (already used by cache-monitor) is sufficient.
- Cross-session analysis of non-cache data (tool errors, edit patterns). This is cache-focused.

## Decisions

**1. Package name: `supi-cache`**

The scope expands from real-time monitoring to include historical investigation — both are about improving prompt cache usage. `supi-cache` is the honest umbrella.

*Rationale:* All code in the package shares the same concern (prompt cache health), same types (`TurnRecord`, `RegressionCause`), and same config surface. A single package avoids type-duplication and keeps discovery simple.

*Alternative considered:* Keep `supi-cache-monitor` and create a separate `supi-cache-forensics` package. Rejected because they share core types, config, and hash utilities — separating them would create a type-ownership problem (where does `TurnRecord` live?) and add package overhead for a ~3-file forensics module.

**2. Internal structure: `monitor/`, `forensics/`, `report/`**

```
src/
├── monitor/          Real-time, event-driven (was root of src/)
│   ├── monitor.ts    Extension factory
│   ├── state.ts      CacheMonitorState, TurnRecord
│   └── status.ts     Footer widget
├── forensics/        Cross-session, query-driven (NEW)
│   ├── forensics.ts  Engine: scan → extract → query
│   ├── extract.ts    Cache-specific extraction utilities
│   ├── queries.ts    Individual query functions
│   ├── redact.ts     ToolCallShape, param fingerprinting
│   └── types.ts      ForensicsFinding, CauseBreakdown
├── report/           TUI rendering for both commands
│   ├── history.ts    /supi-cache-history (was report.ts)
│   └── forensics.ts  /supi-cache-forensics
├── fingerprint.ts    Prompt component fingerprinting
├── config.ts         Shared config
├── settings-registration.ts  Shared settings registration
└── hash.ts           Fast hashing (FNV-1a)
```

**Note:** `fingerprint.ts` arrives from the prerequisite `cache-monitor-prompt-fingerprints` change.

*Rationale:* Three clear concerns with well-defined dependencies — `forensics/` imports types from `monitor/state.ts`, `report/` imports from both. Shared primitives (hash, config, fingerprint) live at root. Tests mirror this structure in `__tests__/monitor/`, `__tests__/forensics/`, `__tests__/report/`.

*Alternative considered:* Flat `src/` with naming convention (`monitor-*.ts`, `forensics-*.ts`). Rejected because the three domains have different test suites, different runtime dependencies, and different audiences — subdirectories make the boundaries explicit.

**3. Forensics engine architecture**

The engine follows a scan → extract → query pipeline:

```
SessionManager.listAll()                     // discover sessions
  → filter by date range, project, model
  → for each session:
      parseSessionFile(path)                 // pi-core utility
      getActiveBranchEntries(entries)        // supi-core utility (moved from insights)
      extractCacheTurnEntries(branch)        // forensics utility (filters custom entries by type)
      extractToolCallWindows(branch, range)  // forensics utility (tool name + param shapes, aligned by timestamp)
      → collect ForensicsFinding[]
  → run pattern query (hotspots, breakdown, correlation, idle)
  → return structured result
```

The engine is a pure function — no state, no event listeners, no side effects beyond file I/O. This makes it callable from both the agent tool and the user command.

*Rationale:* Separating extraction from query logic lets each query pattern compose the same extracted data without re-reading session files. Future patterns can be added as new query functions without touching the engine.

Tool windows are aligned by timestamp ranges (e.g., tools with timestamps between `turn[N-2].timestamp` and `turn[N].timestamp`), not by message order. This handles gaps where a provider doesn't report usage data (no cache-turn entry) but the assistant message still exists.

*Alternative considered:* Tightly-coupled per-pattern scan functions that each read session files independently. Rejected because it would re-read the same files for each query type, hurting performance when the agent chains multiple queries.

**4. Shared utilities in `supi-core`**

One utility moves into `supi-core/src/session-utils.ts`:

- `getActiveBranchEntries(entries: FileEntry[]): SessionEntry[]` — currently a private function in `supi-insights/src/parser.ts`. Walk the append-only tree from the last entry back to root via `parentId`.

Cache-specific extraction functions (`extractCacheTurnEntries`, `extractToolCallWindows`) live in the forensics module in `supi-cache`. They depend on `TurnRecord` which is defined in `monitor/state.ts` — putting them in `supi-core` would create a reverse dependency. `supi-core` only provides generic session-walking utilities that return `SessionEntry[]`.

*Rationale:* Both `supi-cache` and `supi-insights` already depend on `supi-core`. Adding the tree-walk utility there avoids a new package and keeps the dependency tree clean. `supi-insights` updates its imports to use `supi-core` instead of its private copy.

*Alternative considered:* New `supi-session-utils` package. Rejected because the utility is a ~15-line function. A package for 15 lines is overkill.

**5. Agent safety: shape fingerprints as redaction boundary**

The agent tool returns `ToolCallShape[]` — structural fingerprints, not content:

```ts
interface ToolCallShape {
  toolName: string;
  paramKeys: string[];
  paramShapes: Record<string, ParamShape>;
}

type ParamShape =
  | { kind: "string"; len: number; multiline: boolean }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "object"; keyCount: number }
  | { kind: "array"; len: number };
```

The internal `ForensicsFinding` type can carry `_prefixed` fields (`_pathsInvolved`, `_commandSummaries`) that are stripped before the agent tool returns — but available for the human-facing TUI renderer.

*Rationale:* The agent needs enough structure to reason about patterns ("bash calls with pipes precede cache drops") but must not see raw tool arguments or file contents. Shape fingerprints provide structure without content.

*Alternative considered:* Names-only ("bash", "edit", "write") — safe but insufficient for pattern detection. A 5-char bash command and a 500-char pipeline look identical. Shape fingerprints distinguish them.

**6. Idle time as a derived forensics cause**

The runtime `RegressionCause` type does not include "idle" — the runtime monitor only detects synchronous events (compaction, model change, prompt change). The forensics engine derives idle-time regressions post-hoc:

```
if cause.type === "unknown" AND gap > IDLE_THRESHOLD (default: 5 min):
  effective cause = "idle"
```

The `ForensicsFinding.cause` field uses the enriched type `"idle"` in addition to the runtime causes. The runtime `TurnRecord.cause` is unchanged.

*Rationale:* No runtime changes needed. The forensics tool has access to full session history and can compute timestamp gaps between consecutive `TurnRecord` entries. This is purely additive — it reclassifies existing `unknown` causes when an idle gap is present.

**Note on idle semantics:** The gap is inter-turn wall clock (time between consecutive assistant completions), which includes user think time + agent processing. Claude's prompt cache TTL is ~5 minutes, so any gap exceeding 5 minutes can cause cache expiry. The 5-minute default matches Claude's TTL; users on other providers can adjust `idleThresholdMinutes` if their TTL differs.

**7. Two commands, one agent tool**

| Surface | Name | Purpose |
|---|---|---|
| Command | `/supi-cache-history` | Per-turn table for current session (renamed from `/supi-cache`) |
| Command | `/supi-cache-forensics` | Cross-session investigation with TUI report |
| Tool | `supi_cache_forensics` | Agent-callable, returns structured JSON with shape fingerprints |

The commands use `pi.registerCommand()` + `pi.sendMessage()` with a custom message type and a `pi.registerMessageRenderer()` for TUI output. The tool uses `pi.registerTool()` and returns plain JSON.

*Rationale:* Keeping `/supi-cache-history` and `/supi-cache-forensics` as separate commands avoids breaking muscle memory (`/supi-cache` is just renamed, not removed) and gives each command a clear, single purpose.

## Risks / Trade-offs

- **[Risk] Scanning many session files is slow** → Mitigation: default to last 7 days / max 100 sessions with unlimited messages per session. The agent tool accepts `maxSessions` as a parameter (default 100) to prevent unbounded scans.
- **[Risk] `TurnRecord` shape changes in the future** → Mitigation: forensics reads `TurnRecord` defensively — unknown fields are ignored. The extractor handles missing `promptFingerprint` gracefully (old sessions won't have it).
- **[Risk] Package rename breaks downstream consumers** → Mitigation: `@mrclrchtr/supi-cache-monitor` is only consumed by the `supi` meta-package within this repo. No external consumers.
- **[Risk] Shape fingerprints miss nuanced patterns** → Mitigation: the fingerprint captures param length, multiline status, and key presence — enough for most correlation queries. If a real pattern is missed, the shape type can be extended without breaking the agent API.
- **[Risk] Idle-time detection false positives** → Mitigation: the idle threshold matches Claude's prompt cache TTL (5 min default, configurable). Users on other providers can adjust `idleThresholdMinutes`.
