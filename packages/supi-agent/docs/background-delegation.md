# Background delegation design

Status: Implemented. This document defines the approved behavior.

## Scope

- Let the parent continue while read-only Delegation Tasks run.
- Keep Agent Profile policy and parent result delivery in `supi-agent`.
- Reuse Agent Run lifecycle controls, the session registry, and `/agents` from `supi-agent-runtime`.
- Leave Review execution and admission policy unchanged.
- Do not add durable workers, restart recovery, background writers, or workspace isolation.

## Execution policy

| Condition | Default | Explicit foreground | Explicit background |
| --- | --- | --- | --- |
| Read-only batch in TUI or RPC | Background | Supported | Supported |
| Mutation-capable single-task batch in TUI or RPC | Foreground | Supported | Reject before starting |
| Valid batch in print or JSON mode | Foreground | Supported | Reject before starting |

- Keep the current maximum of four Delegation Tasks per batch.
- Keep the current restriction that a mutation-capable profile requires a single-task batch.
- Validate all profiles, models, instructions, mode, and capacity before starting any task.
- A background start returns a batch handle and task identifiers after admission and registration. It does not wait for child setup or results.
- Report initial task status as starting, not ready or completed.
- A background run shares the parent's working directory unless `new.cwd` names a worktree of the same Git repository. Read-only does not mean a frozen snapshot. Parent edits can change what a child observes.

## Capacity

- Default to four active Agent Runs started through `agent_run` per containing session.
- Count foreground and background runs together. Do not count Reviewer Runs against this limit.
- Expose the positive-integer limit through global and project settings.
- Count starting and stopping runs until their owned resources are disposed.
- Reserve capacity for the whole batch before starting any task. Concurrent starts must not overbook slots.
- Reject a batch that does not fit. Include bounded capacity and active-batch information in the failure.
- Do not queue tasks or start only part of an admitted batch.
- Lowering the limit does not cancel existing runs. Reject new starts until they fit.

## Tool interface

### `agent_run`

Keep `tasks` and `sharedContext`. Add optional `mode: "background" | "foreground"` with the defaults in the execution table.

- Foreground returns the final Delegation Batch Result and its Usage.
- Background returns a session-local batch handle, task identifiers, and initial status.
- The background start result does not report child Usage.
- Each task uses exactly one selector: `new: { profile }` or `continue: { conversationId }`. A follow-up keeps the saved Profile ID and uses current profile policy.
- Reject both or neither selector with `Choose exactly one of new or continue.` Identify the task by its array index. Keep the schema constraints and Pi's optional-null handling unchanged.
- A started run returns its conversation reference in progress and result output. Use `agent_list` to find saved references on the active branch.

### Saved conversations

Each completed foreground `agent_run` result can store a child-context checkpoint in tool-result details. Background work stores its checkpoint only when `agent_result` stores the collection. Collect completed background work before continuing its conversation. Repeated collection does not repeat a checkpoint that Pi has already stored.

Checkpoint records follow the active parent branch. They use Pi's raw session entries and are copied with parent branches and clones. They do not create child session files. Parent session files and exports can include child history. See the [resumable conversation design](resumable-conversations.md) for the full record, branch, and validation contract.

### `agent_result`

```ts
agent_result({ batchId, wait: false })
agent_result({ batchId, wait: true })
```

- Omitted `wait` means `false`.
- Without waiting, return the completed task results and the status of pending tasks.
- With `wait: true`, wait until every task in the batch has a terminal outcome.
- Keep task order equal to input order.
- Result reads are repeatable. Collection does not delete results.
- Show `Already collected; no new Usage.` when all available results, their checkpoints, and their Usage are already stored. Keep pending status visible when siblings remain active. Do not show this notice for empty results, unstored concurrent collections, or retries that must store missing checkpoint data or Usage.
- Return bounded task output, failure information, and a clear complete or pending state.
- Reuse aggregate output limits and spill behavior. Keep full transcripts out of model-facing results.
- Only this tool reports Usage for background tasks, under the accounting rules below.
- Reject unknown, expired, or wrong-session handles. Do not expose results to a branch that does not contain their launch.
- Guidance must prohibit repeated polling. Use completion notices or an explicit wait instead.

### `agent_cancel`

```ts
agent_cancel({ batchId })
```

- Request cancellation of active tasks in the identified background batch.
- Repeated cancellation is harmless. Report whether stop was requested or the batch was already terminal.
- Do not treat a stop request as proof that cleanup has finished.
- Do not report child Usage through cancellation. Retain terminal results for `agent_result`.
- Keep model-controlled steering out of this change. Human steering and selected-run stop remain in `/agents`.

## Completion delivery

- Make each task result available when that task finishes. Do not wait for sibling tasks.
- A Delegation Completion Notice contains batch and task identifiers, terminal status, and a direction to collect results. It does not contain task output or Usage.
- Combine notices when several tasks finish before delivery.
- Deliver notices through Pi custom messages with steering delivery. A busy parent receives them at the next safe turn boundary; an idle parent can start a new turn.
- Do not interrupt an executing parent tool.
- Deliver each completion notice at most once within the active ownership scope. Repeated result reads must not generate notices.
- Before the next model request, omit queued or retained notices when all named tasks have successful stored collections on the active raw branch. Failed or unstored collections do not suppress notices. This context filter does not rewrite the human transcript.
- Failures and timeouts are terminal results and can notify the parent. Provider-reported errors use `provider-error` and a bounded canonical reason when available. Quota or credit failures remain distinct from rate limits. Missing Usage alone is not a failure signal.
- User-requested cancellation must not itself start another parent turn.
- Prevent completion-before-start-return races from producing an orphan notice. Establish the batch identity and launch ownership before delivery.

## Cancellation and ownership

- The containing session owns background batches. A completed starting tool does not release them.
- Normal parent completion does not cancel active background batches.
- Any parent abort requests cancellation of all active background Delegation Batches owned by `supi-agent` in that session.
- Pi does not identify the abort source. Apply this rule to Escape, RPC abort, and other parent aborts equally.
- After parent abort, pause automatic completion delivery until a later user-originated prompt. Retain completed and canceled task results and Usage for later collection.
- Do not restart stopped parent work because a completion races with cancellation.
- Parent abort also cancels a pending `agent_result` wait. Observe active parent cancellation promptly; do not wait for parent settlement to release a blocked result wait.
- Stopping one run through `/agents` does not pause notices from other runs. Its canceled result must not itself start a parent turn.
- Idle Escape retains Pi's existing editor, autocomplete, and dialog behavior. It does not cancel children through a parent-abort event.
- Use existing `/agents` controls to stop selected runs while the parent is idle. Do not add `/agent-stop`, replace the editor, or install a global Escape handler.
- Stop owned runs on reload, session replacement, and session shutdown. Suppress late delivery from the old session.
- Keep uncancelable startup awaited. Cancellation can wait for Pi setup before disposal; do not promise a hard startup-stop deadline.

## Branches and retention

- Associate each batch with the stored launch on the active conversation branch.
- Keep the batch while the active branch contains its launch.
- After tree navigation abandons that launch, cancel active tasks and suppress delivery on the new branch.
- Check raw branch ancestry. Compaction alone does not abandon the launch.
- Keep bounded results and accounting state until the containing session closes. Do not impose an independent short result expiry.
- Retain canceled results for inspection and for collection if their originating branch is active again.
- Keep full human-only transcripts under the existing runtime retention policy.
- Batch handles, active runs, and uncollected results do not survive session shutdown or restart. Saved conversation checkpoints remain in the parent history.

## Usage accounting

- Report a background task's complete Usage on the first collection whose Usage Pi stores.
- Include successful, failed, timed-out, and canceled tasks that incurred Usage.
- Do not report Usage for pending tasks.
- Repeated or concurrent collection must not count the same task twice.
- Use stored collection receipts to distinguish reported from unreported Usage. Merely preparing a tool result is not proof that Pi stored it.
- An aborted or failed collection without stored Usage must remain unreported. If a result hook marks delivery as failed or replaces details but Pi still stores the prepared Usage, count it as reported. Retry the output without charging that Usage again.
- Foreground Usage remains on the original `agent_run` result and must not be counted again through background collection.
- Mark uncollected terminal Usage clearly in `/agents`. Pi's parent totals are incomplete until collection.
- If a result is never collected, accept that its Usage is absent from Pi's parent totals. Do not hide this limitation.
- Do not cast Pi's read-only extension session manager to a mutable manager. Do not fabricate tool results or compaction entries for accounting.

## Verification requirements

- A background start returns before a controlled child completes; foreground still waits.
- Invalid input, unavailable background mode, invalid profiles, and insufficient capacity start no task.
- Concurrent batch starts cannot exceed the session limit. Review policy is unchanged.
- Fast tasks notify and can be collected while siblings remain active.
- Collection supports partial results, repeated reads, and an explicit full-batch wait.
- Usage is counted once across repeated, concurrent, canceled, and failed collection paths.
- Startup failure, runtime failure, timeout, and cancellation retain terminal results and any Usage.
- Completion notices handle busy and idle parents without polling or duplicate delivery.
- Parent abort cancels background batches and prevents completion from restarting the parent.
- Normal parent completion does not cancel background batches.
- Selected-run stop remains selected-run-only; batch cancellation stops its active tasks.
- Reload, session replacement, branch abandonment, and shutdown cannot leak results into another context.
- Compaction preserves launch ownership. Switching away and back does not restart canceled tasks.
- Print and JSON default to foreground and reject explicit background requests.
- Idle Escape, autocomplete, dialogs, and `/agents` retain their existing input behavior.
- Output remains bounded, and full transcripts remain outside parent model context.

## Evidence

- Installed Pi `docs/extensions.md`: tool results, custom messages, lifecycle boundaries, modes, and context invalidation.
- Installed Pi `docs/sdk.md`, `docs/message-types.md`, and `docs/session-format.md`: session ownership and Usage records.
- Installed Pi `docs/keybindings.md` and `docs/tui.md`: editor input and UI ownership.
- Installed Pi `dist/core/extensions/types.d.ts`: extension message delivery, read-only session access, abort settlement, and tree events.
- Installed Pi `dist/modes/print-mode.js`: session disposal after supplied prompts.
- Installed Pi `dist/modes/interactive/interactive-mode.js`: Escape behavior when the parent is idle.
- [Earlier foreground decision](adr/0008-keep-agent-runs-foreground-and-awaited.md).
- [Accepted background decision](adr/0010-own-background-delegation-in-the-containing-session.md).
