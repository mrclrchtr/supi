# supi-debug

Debug surface for SuPi: session-local diagnostic event inspection via `/supi-debug` command and `debug` tool. Consumes events from the Debug Registry.

See also: `packages/supi-core/GLOSSARY.md` (Debug Registry, Debug Event Producer, Debug Operation ID, Debug Surface).

The surface displays and filters an optional Debug Operation ID by exact equality in live and persisted events. The identity means explicit direct request ownership. It does not mean time overlap, security identity, raw Pi Tool-call identity, or a distributed trace.

**Tooling Retrospective**:
The report produced by the `/supi-tooling-retro` command, which evaluates which SuPi surfaces were used, missed, missing, or noisy in the completed task. The user chooses per run whether it runs on a side branch, so the continued session keeps the report out of the agent's context, or on the main path, so the report stays in context. When Debug persistence is active, the report is stored as a `tooling-retrospective` Debug event so `gather-retrospectives` can collect it. It is feedback for improving SuPi tooling, not a debug-event report.
_Avoid_: retro, post-task review

**Cache Forensics**:
Cross-session analysis of prompt-cache hit-rate drops (`/supi-cache-forensics`, `cache_forensics`), grouped by cause. Per-turn current-branch usage is **Cache History** (`/supi-cache-history`). Pi owns live cache statistics and cache-miss notices.
_Avoid_: cache monitor
