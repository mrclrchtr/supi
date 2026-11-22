---
status: accepted
---

# Own Background Run Batches and Result Collection in the runtime

Review needs the same background execution that Agent already has: a caller that continues while runs are active, a notice when results are ready, and Usage that is counted once. The runtime therefore owns Background Run Batches for both packages: launch-branch and session ownership, parent-abort handling, Completion Notice delivery, waiting, Usage receipts, and shutdown. It registers `agent_result` and `agent_cancel` once per Pi runtime, in the same way as `/agents`, and both tools serve every owner. Owner packages keep admission policy and the result format.

## Considered options

- **A Review-owned controller beside the Agent one.** Rejected: the notice-delivery and Usage-accounting rules would exist twice and drift apart.
- **Review depends on `supi-agent`.** Rejected: Review must stay installable alone and must not load Agent Profile policy.
- **Separate `review_result` and `review_cancel` tools.** Rejected: two more tools with the same contract; Reviewer Runs are already Agent Runs in `/agents`.
- **Neutral tool names such as `run_result`.** Rejected: a breaking rename for Agent with no behavioral gain. A Review-only installation therefore collects with a tool named `agent_result`.

## Consequences

- The ownership, delivery, cancellation, retention, and accounting rules of [Agent ADR 0010](../../../supi-agent/docs/adr/0010-own-background-delegation-in-the-containing-session.md) stay in force. This decision moves their neutral mechanics here; it does not change them.
- Agent keeps Agent Profiles, Delegation Conversations, Delegation Checkpoints, and the `maxConcurrentRuns` limit. Reviewer Runs still do not count against that limit.
- The owner formats collected results. The runtime adds no Review policy, Review audit, or Agent Profile policy, as in [ADR 0013](0013-share-the-session-run-viewer-and-transcripts.md).
- The owner selects Completion Notice granularity: per task for a Delegation Batch, once per batch for a Review.
- The extraction lands first as a behavior-preserving change for Agent, verified by the existing Agent test suite, before Review becomes a second owner.
- The runtime remains library-only. The collection tools exist only when an owner package registers them.
