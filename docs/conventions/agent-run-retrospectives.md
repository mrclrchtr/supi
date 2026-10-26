# Agent Run retrospectives

Status: implemented.

## Purpose and scope

- Collect task-specific, self-reported feedback for later human-led improvements to delegation, tools, and guidance.
- Cover both Delegation and Reviewer Runs through shared Agent Run lifecycle support.
- Keep capture simple: one final assessment turn and an existing SuPi Debug event. Historical gathering is an explicit, read-only skill workflow; no background aggregation system, evaluation framework, or automatic adaptation.
- Treat observed friction as evidence and proposed improvements as untested suggestions, not verified savings.

## Agreed behavior

| Decision | Contract |
| --- | --- |
| Opt-in | `debug.agentRunRetrospectivesEnabled`, off by default; exposed in Debug settings, not as a parent-selected per-call option. |
| Logging prerequisite | Run only when SuPi Debug capture and its persistence sink are active. Do not spend tokens on an assessment that would be discarded. |
| Eligibility | Normally completed tasks only. Skip failed, canceled, timed-out, and failed-startup runs. Recovered tool failures within successful tasks remain useful evidence. |
| Trigger | Freeze and publish the task result before starting the retrospective. For background delegation, do not wait for `agent_result` collection. |
| Session | Use the same live child session and its available conversation context, not a new diagnostic run. |
| Authority | No active tools. Do not continue the task, perform new investigation, or execute another structured-completion protocol. |
| Budget | No retrospective-specific token or wall-clock limit. Normal cancellation, ownership, and shutdown rules still apply. |
| Attempts | One assessment turn, with no retry or repair, including automatic retry paths. |
| Output | Free-form assessment text in the existing Debug log; no new report schema or storage system. |
| Failure | A failed, interrupted, or unloggable retrospective cannot change the published task result. No guarantee of a report after cancellation or shutdown. |

## Lifecycle boundary

`AgentRunHandle.taskResult` exposes the task outcome and task-only Usage. `AgentRunHandle.result` remains terminal: it resolves after session disposal and includes all Agent Run Usage. `startRegisteredAgentRun()` also waits for final transcript writes on `result`, not on `taskResult`.

Required ordering:

1. Settle the task and accept its caller-owned completion, including any existing completion recovery.
2. Freeze the task completion, task Usage, and any captured follow-up context before retrospective-specific prompt or tool changes.
3. Publish the frozen task result so the caller can return or collect it without waiting for the retrospective.
4. If collection is enabled and logging is active, perform the single tool-free retrospective turn.
5. Record its text and separately measured Usage, then dispose the session normally.

Constraints:

- Result readiness is not terminal Agent Run completion. Keep the existing terminal outcome/disposal guarantee rather than silently changing the meaning of the outcome promise.
- Keep the child owned and stoppable until disposal; do not detach retrospective work from the shared run registry or containing session. Delegation and Reviewer adapters only opt in when their registry is available; direct runtime callers retain their own Handle.
- A normal parent turn ending does not itself cancel the retrospective. Parent abort, ownership loss, and shutdown still apply through the owning adapter's lifecycle.
- A parent follow-up uses the frozen checkpoint, never retrospective messages or retrospective-specific context changes. It need not wait for the retrospective to finish.
- Parent-facing tools describe task-result readiness, collection, and generic cancellation/cleanup only. Do not expose retrospective progress or ask the parent to wait for assessment. Collection advice applies only to pending or uncollected task results.
- Preserve task-result Usage at publication. Log retrospective Usage separately; it cannot be retroactively added to a returned tool result. The final Agent Run Outcome still accounts for all billed work, without counting either phase twice.
- Stop or failure during the retrospective affects only that phase, not the already published task result. The terminal outcome preserves the successful task completion and frozen task context, with final session-wide Usage.
- This phase is distinct from finite continuation for missing completion. In particular, a Reviewer retrospective must not need another `submit_review` call.
- The runtime owns prompting, settlement, cancellation, usage measurement, and disposal. Callers retain opt-in, prompt, completion, and evidence policy; do not expose mutable session controls.
- `createDebugAgentRunRetrospective()` supplies the shared Debug policy explicitly. It checks eligibility at admission and again at task completion. No policy is supplied to Planner Drafts.
- Task observers finish before assessment; registry transcript capture remains attached until final disposal. Retrospectives remain visible as active, non-steerable `retrospecting` runs, but do not consume delegation task-admission capacity.

## Assessment prompt

Starting wording; not a new structured-output protocol:

> Reflect briefly on the task you just completed. Based only on the context available from this run, what would have made it more token/time efficient or more effective?
>
> Focus on missing or unnecessary context from the parent, unclear tool guidance, suboptimal tool results, and tool failures or misuse. For each useful finding, name the observed friction and the specific change that might help. Clearly distinguish observations from untested suggestions. Do not invent savings estimates or generic recommendations. If nothing notable occurred, say so.
>
> Do not continue the task, use tools, or repeat sensitive task content unnecessarily.

Adapt the existing [`/supi-tooling-retro` prompt](../../packages/supi-debug/prompts/supi-tooling-retro.md) rather than introducing a reporting framework. Its interactive evidence queries and lengthy output template are not required here.

## Debug logging

- Use the existing Debug event persistence path in the containing session, not normal Agent Run Diagnostics or parent-facing result content.
- Keep the event message static; put assessment prose in event `data` so it receives existing best-effort redaction. Do not use raw-only data, which is not persisted.
- Include `runKey`, `caller`, `batchId`, `taskId`, and a readable `label` alongside retrospective text and Usage. Delegation also includes `conversationId`; its label remains the saved conversation label on follow-ups. Reviewer labels identify the Review Mode.
- Correlation metadata belongs in sanitized Debug `data`, not parent tool results. Include identifiers and display labels only, never task instructions or inspected evidence.
- Debug capture retains session entries outside automatic model context. Existing Debug access and retention behavior apply; assessment text may still contain sensitive task details.
- Do not add a new durable transcript copy, replay store, background aggregation, or automatic feedback channel.
- `supi-debug` supplies the [`gather-retrospectives` skill](../../packages/supi-debug/skills/gather-retrospectives/SKILL.md) for user-requested historical gathering. Its Node collector reads existing structured assessment events, defaults to the current workspace tree, requires explicit cross-workspace scope, and writes disposable evidence pages with provenance and coverage. It excludes interactive retrospectives and never changes capture settings or task results.

## Implementation verification targets

- A blocked retrospective does not block task-result delivery or background collection.
- The retrospective cannot execute tools, retry, repair, or alter task completion.
- Follow-up checkpoints exclude the retrospective and its setup changes.
- Disabled retrospectives, inactive logging, and unsuccessful task outcomes cause no retrospective model request.
- Cancellation and shutdown stop retrospective work without invalidating a published result or detaching resources.
- Usage is separated by phase and counted once; final run accounting includes both phases.
- Delegation and Reviewer adapters both preserve their existing completion and evidence policies.

## Related contracts

- [Runtime lifecycle and API](../../packages/supi-agent-runtime/README.md)
- [Caller-owned resources and policy](../../packages/supi-agent-runtime/docs/adr/0001-own-session-mechanics-not-resource-policy.md)
- [All Agent Run Usage](../../packages/supi-agent-runtime/docs/adr/0005-account-for-all-agent-run-usage.md)
- [Settlement and cancellation](../../packages/supi-agent-runtime/docs/adr/0011-make-settlement-authoritative-and-cancellation-a-fence.md)
- [Finite same-session continuation](../../packages/supi-agent-runtime/docs/adr/0012-own-finite-same-session-continuation.md)
- [Background delegation](../../packages/supi-agent/docs/background-delegation.md)
- [Resumable Delegation Conversations](../../packages/supi-agent/docs/resumable-conversations.md)
