# Store human Agent Run transcripts temporarily

## Status

Accepted

## Context

The bounded Conversation View cannot show every message or full tool result. The `/agents` viewer needs complete human-facing evidence, but this evidence must not enlarge model-facing results or persist as child-session history.

## Decision

- Capture finalized Agent Run messages, effective system prompts, and allowlisted lifecycle fields in JSONL files under one temporary directory for the current parent session.
- Retain transcripts for every batch until session shutdown. Do not add an application cap or restart recovery.
- Exclude transport credentials and provider debug fields. Keep render-only tool definitions; never store their execution functions.
- Continue the Agent Run after a storage failure. Mark its transcript incomplete and show the available data.
- Remove the temporary directory during awaited session-shutdown cleanup.
- Keep the bounded Conversation View and existing model-facing result bounds unchanged. Do not return transcript data from `agent_run`.
- Keep `/agents` independent of global `tuiMode`. Closing the viewer does not stop a run. A confirmed stop affects only the selected run.

## Consequences

- The viewer can render complete captured messages with Pi's public message and tool components.
- Raw tool input and output stay hidden until the user expands them.
- Session shutdown removes all transcript files. There is no restart recovery.
- A storage error can leave an incomplete transcript, but it does not change the Agent Run outcome.
