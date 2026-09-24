# Retain a bounded Agent Conversation View

## Status

Accepted

## Decision

Keep the parent-facing Conversation View bounded to the newest 100 visible entries and 50 KB of text. Keep one row for every task. The view contains assistant text, steering, and safe tool summaries. It omits private reasoning, signatures, full tool results, and arbitrary tool arguments.

Keep the complete human-only Agent Run Transcript separate from the Conversation View. `/agents` reads it from temporary session storage. It never enters the parent tool result. See [ADR 0009](0009-store-human-agent-run-transcripts-temporarily.md).

## Consequences

- The model-facing result stays within its existing bounds.
- Human details can show the full captured message sequence, including tool results and system prompt history.
- The bounded Conversation View remains available when transcript storage is incomplete or unavailable.
- Bash activity keeps a control-stripped, secret-redacted, whitespace-collapsed first-line preview capped at 120 characters.
