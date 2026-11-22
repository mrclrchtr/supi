---
status: accepted
---

# Run Reviews in the background by default

A Review takes minutes and held the parent turn open for its whole duration. In TUI and RPC, `review_run` now starts a Background Review by default, so the Agent and the user can continue. Print and JSON modes stay foreground and reject an explicit background request. `mode: "foreground"` restores the awaited behavior. `/supi-review` stays foreground.

`review_run` returns only after the Review Target is frozen in its Review Workspace and any configured Dependency Bootstrap has finished. Invalid input, an unresolvable target, and setup failures therefore fail the call itself and create no batch. Later parent edits cannot enter the reviewed state.

## Considered options

- **Foreground default with opt-in background.** Rejected: the default should serve the common case of continuing to work during a Review.
- **Return before the freeze or before the bootstrap.** Rejected: an immediate parent edit could enter a `workingTree` target, and setup failures would surface only through a later notice.
- **One Completion Notice per Review Task.** Rejected: a Review yields one report and one Post-Review Policy application. An early task result would start a parent turn that may neither fix nor decide, and duplicate or conflicting findings across tasks are visible only at the end.
- **A limit on concurrent Reviews.** Rejected: the caller must be able to continue working and review the newer state while an earlier Review runs.
- **Keep the Review Workspace until collection.** Rejected for now: nothing reads it after the Reviewer Sessions end. Follow-up questions to a Reviewer are a separate, later decision that may change this.
- **Compute drift between the frozen state and the live checkout.** Rejected: the collected result names the reviewed state, and the Post-Review Policy's applicability gate already checks findings against the live checkout.

## Consequences

- This is a breaking change to `review_run` in TUI and RPC: the call returns a batch handle and the Review Workspace Receipt, not the report.
- Results are collected with `agent_result` and stopped with `agent_cancel`, under [runtime ADR 0014](../../../supi-agent-runtime/docs/adr/0014-own-background-run-batches-and-result-collection.md). Review formats its own collected result.
- A Background Review sends one Completion Notice when every Review Task is terminal. A collection before that shows intermediate task state without the Post-Review Policy.
- Parent abort, leaving the launch branch, reload, and session shutdown stop a Background Review. It does not survive a restart.
- The Review Workspace is removed when every task is terminal, in both modes.
- An uncollected result stays available until the containing session ends. A Review Output Artifact, with its own expiry, is created at collection.
- Reviewer Usage reaches the parent's totals only at the first stored collection.
- Several Reviews can be active at once, each with its own Review Workspace and up to four Reviewer Sessions. Only the user, through `/agents`, bounds an Agent that starts many.
- A status line stays visible while a Background Review runs.
