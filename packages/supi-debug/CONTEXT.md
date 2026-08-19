# supi-debug

Debug surface for SuPi: session-local diagnostic event inspection via `/supi-debug` command and `debug` tool. Consumes events from the Debug Registry.

See also: `packages/supi-core/CONTEXT.md` (Debug Registry, Debug Event Producer, Debug Operation ID, Debug Surface).

The surface displays and filters an optional Debug Operation ID by exact equality in live and persisted events. The identity means explicit direct request ownership. It does not mean time overlap, security identity, raw Pi Tool-call identity, or a distributed trace.

**Tooling Retrospective**:
The `/supi-tooling-retro` Prompt Template that evaluates which SuPi surfaces were used, missed, missing, or noisy in the completed task. It is feedback for improving SuPi tooling, not a debug-event report.
_Avoid_: retro, post-task review
