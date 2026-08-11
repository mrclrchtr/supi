# Superseded: use the neutral Agent Run runtime seam

This decision is superseded by issue #268 and `@mrclrchtr/supi-agent-runtime`.

The former `runWithLifecycle`/`runIsolatedChild` split kept lifecycle tests close to review, but it also coupled a reusable Agent Run state machine to Reviewer Session policy. The neutral runtime now owns session creation, binding, prompting, settled-event races, cancellation/timeout, usage, diagnostics, abort grace, and disposal behind the public `startAgentRun()` handle.

`supi-review` retains `child-session-runner.ts` as a thin adapter: it supplies Review-owned resources and structured completion, maps runtime outcomes to the stable child-outcome vocabulary, and attaches audit and capability observers. Lifecycle contract tests now live at the runtime's public `startAgentRun()` seam, while review tests cover adapter and behavior parity. Do not restore the deleted review-owned lifecycle machinery; extend the runtime API or its contract tests when generic lifecycle behavior changes.
