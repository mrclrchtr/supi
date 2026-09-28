# Store human Agent Run transcripts temporarily

## Status

Accepted

## Context

The bounded Conversation View cannot show every message or full tool result. The `/agents` viewer needs complete human-facing evidence, but this evidence must not enlarge model-facing results or persist as child-session history.

## Decision

- The runtime captures finalized messages, effective system prompts, and allowlisted lifecycle fields in JSONL files under one temporary directory for the containing session.
- Retain transcripts for every registered Agent or Reviewer run until session shutdown. Do not add an application cap or restart recovery.
- Exclude transport credentials and provider debug fields. Keep render-only tool definitions; never store their execution functions.
- Continue the Agent Run after a storage failure. Mark its transcript incomplete and show the available data.
- Let the runtime own transcript storage and awaited session-shutdown cleanup. Keep this package focused on Agent Profile policy and Agent Run result behavior.
- Keep the bounded Conversation View and existing model-facing result bounds unchanged. Do not return transcript data from `agent_run`.
- Keep `/agents` independent of global `tuiMode`. Closing the viewer does not stop a run. A confirmed stop affects only the selected run.

## Consequences

- The viewer can render complete captured messages with Pi's public message and tool components.
- Raw tool input and output stay hidden until the user expands them.
- The runtime removes all Agent and Reviewer transcript files at session shutdown. There is no restart recovery.
- Review audit settings do not change this transcript retention. See the runtime decision in [ADR 0013](../../../supi-agent-runtime/docs/adr/0013-share-the-session-run-viewer-and-transcripts.md).
- A storage error can leave an incomplete transcript, but it does not change the Agent Run outcome.
