# supi-context

Observability for how a PI session occupies and approaches the limit of its context window.

## Language

**Context Pressure Snapshot**:
A small, point-in-time capacity reading used to decide whether the session has room for another operation. It excludes diagnostic inventories and breakdowns.
_Avoid_: concise report, mini report

**Context Usage Report**:
A diagnostic account of how the current session occupies its context window, including attribution and composition details.
_Avoid_: snapshot, context dump

**Active Context Limit**:
The threshold that currently governs context pressure: the auto-compaction threshold when auto-compaction is enabled, or the model's hard context-window limit when it is disabled.
_Avoid_: always treating the configured reserve as active

**Headroom**:
The capacity remaining before the session reaches the Active Context Limit. It is reserve-adjusted only when auto-compaction is enabled.
_Avoid_: free space, remaining context

**Usage Percentage**:
The share of the model's raw context window currently occupied by the session.
_Avoid_: pressure

**Pressure Percentage**:
The share of the token budget up to the Active Context Limit currently occupied by the session. It reaches and can exceed 100% when Headroom reaches zero.
_Avoid_: usage percentage, window committed

## Surfaces

- `context_report` returns a Context Pressure Snapshot by default. Its `full` mode returns a Context Usage Report only when diagnostic attribution is needed.
- `/supi-context` and `/supi-context full` are TUI-only human surfaces. They persist Context Usage Reports as custom entries, not LLM-context messages.

See also: root `CONTEXT.md` (Context Usage Monitor, Context Efficiency).
