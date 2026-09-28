# Register Reviewer Runs in the shared viewer

## Status

Accepted

## Context

Review owns Reviewer Session policy and optional Local Reviewer Replay retention. Users also need to inspect an active Reviewer Session and its full transcript in `/agents`. This transcript must remain available when Review audit is off.

## Decision

- Register each Reviewer Session in the runtime-owned Agent Run Registry with neutral run metadata.
- Use the runtime transcript store for the full human-only session transcript. Keep its containing-session lifetime separate from the seven-day Review audit lifetime.
- Keep the Review observer for audit capture. Compose its cleanup with the runtime transcript observer; neither observer replaces the other.
- Show Reviewer Runs with Agent Runs in one `/agents` command. Do not move Review policy, Review audit, or Review result formatting into the runtime.
- While interactive `/supi-review` runs, show `Ctrl+O` to open this viewer without stopping the Review.
- Share one Review group ID across Reviewer Sessions from the same Review request.

## Consequences

- `/agents` can show Reviewer progress, transcript messages, and selected-run controls when Review is installed.
- Turning Review audit off does not disable the shared transcript.
- Session shutdown removes the runtime transcript. Review audit keeps its own seven-day retention.
- Agent-only installations can supply Agent Profile pages. Review does not supply Profile policy.

See [runtime ADR 0013](../../../supi-agent-runtime/docs/adr/0013-share-the-session-run-viewer-and-transcripts.md).
