# Resumable Delegation Conversations

Status: Implemented. This document defines the approved behavior.

## Goal

- Reuse an explorer's previous context for related questions.
- Keep separate conversations for separate areas, even when they use the same Agent Profile.
- Let the parent review an implementer's work and send corrections to the same conversation.
- Restore saved conversations when the containing parent session is reopened.
- Prefer Pi's existing session behavior over a separate history store.

## Domain model

| Term | Meaning |
| --- | --- |
| Agent Profile | Current instructions, tools, model preferences, and resource policy selected by Profile ID |
| Delegation Conversation | Retained child context owned by one parent session; several conversations can use the same profile |
| Agent Run | One execution with its own terminal outcome, result, cancellation, and Usage |
| Delegation Follow-Up | New instructions that start a new Agent Run with an existing conversation's saved context |
| Delegation Checkpoint | Child context associated with one stored Delegation Task Result |

- A conversation is not an idle worker. Dispose each Agent Run after it finishes.
- A follow-up does not reopen or change an earlier Agent Run Outcome.
- Success, failure, cancellation, and timeout can produce a checkpoint when valid child context and a task result are stored.
- A follow-up does not automatically repeat interrupted model requests or tool actions.
- A run that produces no valid saved context has no new checkpoint.

## Tool interface

### `agent_run`

Each task selects exactly one of `new` or `continue`:

```ts
agent_run({
  tasks: [{
    id: "infrastructure",
    new: { profile: "explore" },
    instructions: "Inspect the deployment configuration.",
  }],
});

agent_run({
  tasks: [{
    id: "deployment-check",
    continue: { conversationId: "<returned conversation reference>" },
    instructions: "Now check how the production secrets reach the service.",
  }],
});
```

- Keep batch-wide `sharedContext` and `mode`.
- Add the current shared context and task instructions as new input. Do not replace earlier messages or resend the full original task as a new request.
- Return a conversation reference for each task. Keep batch, task, and run identities separate from conversation identity.
- Use the initial task ID as the conversation's display label. Labels need not be unique; references identify conversations.
- Resolve a follow-up reference only within the current parent session and its active raw branch.
- Do not accept an arbitrary child-session path or another parent's conversation reference.
- Select the latest saved checkpoint for that conversation on the active parent branch.
- Do not select a conversation automatically from its profile or task text.
- Permit batches that mix new conversations and follow-ups to independent conversations.
- Retain the four-task batch limit and all existing mode, mutation, admission, and capacity rules.
- Mutation-capable profiles remain single-task and foreground. Read-only profiles retain existing background defaults.
- Validate the complete batch before starting any task.
- Reject duplicate conversation targets within one batch.
- Permit only one active Agent Run per conversation in the containing session. Reject conflicts; do not queue or silently create another conversation.
- Require result collection before continuing completed background work. Do not silently use an older checkpoint while a newer result awaits collection in the live session.

### `agent_list`

- Add an on-demand tool that lists saved conversations on the active parent branch.
- Return bounded, pageable rows with the conversation reference, original task ID, Profile ID, and status or reason continuation is unavailable.
- Include live activity and pending collection when applicable.
- Do not return child history, raw tool data, or past Usage as new Usage.
- Do not inject the list automatically into the parent prompt.
- Keep the first version limited to listing. Do not add a separate conversation catalogue, search service, rename flow, or deletion tool.

### `agent_result` and `agent_cancel`

- Keep the existing background result collection and cancellation interfaces.
- A stored `agent_result` collection can establish checkpoints for the terminal tasks it contains.
- Repeated collection must not create new conversation steps or report old Usage again.
- Keep batch handles process-local. Reopening a parent restores saved conversations, not old batch controllers or uncollected results.

## Saved context and retention

- Store continuation data in parent tool-result `details`, outside model-facing result `content`.
- Use Pi-native child-session entries as the context representation. Do not use the bounded Conversation View or the temporary human transcript as restoration data.
- Store the new child entries for a checkpoint with a reference to its preceding checkpoint. Avoid repeating the full child history on each follow-up or repeated result read.
- Retain the data needed to reconstruct the child entry ancestry and active leaf, including compaction and context-edit entries.
- Version and validate the stored record format.
- Reconstruct state from the parent's raw active branch, not all session entries and not its compacted model-context projection.
- A checkpoint becomes available only when Pi stores its required result data. Preparing a result, sending a notice, or completing the child does not prove persistence.
- Foreground save point: the stored `agent_run` result.
- Background save point: the stored `agent_result` collection.
- If result hooks remove the required state, do not treat that checkpoint as saved.
- Keep each checkpoint payload once. Later result reads can refer to the saved checkpoint.
- Uncollected background work has no durable checkpoint. After reopen, use the earlier saved checkpoint, if one exists.
- A process crash can lose work since the last saved checkpoint. Do not restart that work automatically.
- Parent sessions without persistence have session-local conversation reuse only. Do not create hidden durable child files for them.
- Child records follow parent-session retention, including copies, backups, trash behavior, and deletion. There is no separate expiry period or cleanup service.
- Parent JSONL files become larger. Parent file copies and JSONL exports contain the saved child records and can include source text and full tool results.
- Do not add credentials or transport diagnostics to continuation records. Tool output can itself contain sensitive data and requires the same care as other session evidence.
- Keep the temporary human-only Agent Run Transcript Store separate. This design does not add durable viewer-transcript restoration.

## Branches, forks, and clones

| Parent action | Child-context behavior |
| --- | --- |
| Reopen the same session | Reconstruct saved conversations on the active raw branch |
| Compact parent context | Keep checkpoints reachable through raw branch ancestry |
| Return to a branch before follow-up B | Continue from the earlier saved checkpoint A, not from B |
| Return to B's branch | Make B's saved checkpoint available again |
| Fork before a user message | Inherit only checkpoints before Pi's fork cut |
| Clone the active branch | Inherit checkpoints on that branch |
| Continue an inherited conversation | Write new checkpoints only into the new parent session |

- Scope conversation identity to the containing parent session. A copied local reference must not address the source parent's live state.
- Use Pi's native copy of stored parent entries. Do not add an external child-file copy protocol.
- A checkpoint absent from the selected ancestry cannot be recovered from a branch summary or an abandoned sibling branch.
- Preserve the existing cancellation rules for active work when branch ownership is lost.
- Tree navigation does not undo workspace changes. Context selection and workspace state are separate.
- Branch and fork support must stay within this native-history approach. If an implementation needs a separate ownership or copy system, return for a design decision rather than add it silently.

## Profile and workspace policy

- Retain the conversation's Profile ID. Do not allow a follow-up to switch profiles.
- Resolve the currently effective profile policy for each new Agent Run.
- Apply current prompt assets, instruction scopes, tools, model, and thinking settings under the existing catalogue-refresh rules.
- Preserve current project trust, model authorization, resource exclusions, and capability checks.
- A missing, disabled, invalid, or unauthorized profile blocks continuation. Do not replace it with another profile.
- Saved messages are context, not authority to restore old tool access.
- Continue in the working directory the conversation started with: the parent's, or the `new.cwd` worktree saved in its checkpoint, under the existing execution policy. Do not add workspace snapshots or permission isolation.
- Retained findings are historical observations. The child must check current files before it relies on facts that can have changed.
- Preserve native context compaction. Do not promise exact, unlimited recall or implement a separate memory-summary system.
- Do not restore process resources, live tool handles, credentials, or arbitrary extension state merely because their descriptions appear in saved messages.
- After failure or cancellation, tell the new run that earlier actions can be incomplete or uncertain. It must check actual state before repeating an action.
- Reject missing, invalid, or unsupported checkpoint data with a clear error. Do not silently start a fresh conversation or invent missing tool outcomes.

## Runtime seam and accounting

- `supi-agent` owns conversation references, branch reconstruction, profile policy, tool input, and parent result persistence.
- `supi-agent-runtime` owns child-session construction, restored-context input, finalized context capture, run-only Usage, settlement, and disposal.
- Keep the runtime interface small: accept validated starting context and expose finalized context as plain data. Do not expose a mutable owned `AgentSession` or its lifecycle controls.
- Preserve existing cancellation fences and bounded disposal. Do not keep sessions alive between follow-ups.
- A restored history must not count as new Usage.
- Count all newly billed work in the new Agent Run, including nested tool work, compaction, failures, and cancellation.
- Preserve stored-result receipt rules for parent accounting. Checkpoint persistence and Usage persistence are separate facts when a result hook changes output.
- Keep full child history outside the parent model context and normal diagnostics. Do not increase model-facing output bounds.
- Reviewer Runs and finite internal runtime continuations retain their existing policy. They do not gain durable conversations through this change.

## Out of scope

- Automatic recovery or replay of interrupted executions.
- Durable active workers or a queue of follow-ups.
- Recovery of uncollected task results after process exit.
- Arbitrary reuse across unrelated parent sessions.
- A new human continuation action in `/agents`.
- A separate child-history store, retention timer, or deletion interface.
- Automatic selection of a previous conversation by profile or topic.
- Migration of old runs that never stored continuation data.

## Verification requirements

- Start two `explore` conversations for different areas. Continue either without mixing their histories.
- Run an implementer, inspect its changes, and send review corrections through the same conversation.
- Dispose the child between runs and verify that saved context is restored without exposing mutable session controls.
- Reopen the parent and continue its saved explorer and implementer conversations.
- Reject a second active request for the same conversation and duplicate targets in a batch. Start no partial batch after validation failure.
- Continue valid saved context after success, failure, cancellation, and timeout without automatic tool replay.
- Apply current profile policy and reject disabled, missing, invalid, and unauthorized profiles.
- Verify A → B, parent navigation back to A, then C. C must not receive B's child context.
- Fork and clone a parent with saved conversations. Subsequent child runs in the source and copy must remain independent.
- Preserve raw checkpoint ancestry across parent and child compaction, including native context edits.
- Save no new durable checkpoint for uncollected background work. Preserve the previous checkpoint after reopen.
- Reconstruct conversations after parent compaction through `agent_list` without injecting child history into the parent model context.
- Reject corrupt, missing, or unsupported records and absent-branch references without silent fallback.
- Verify result-hook cases where Usage is stored but checkpoint data is removed, and where a result was prepared but not stored.
- Repeated or concurrent result collection must not duplicate checkpoint payloads or Usage.
- Restored history, copied history, and abandoned child branches must not be charged as new run Usage.
- Preserve existing mode, mutation, capacity, cancellation, output-bound, and Reviewer behavior.
- Verify that non-persistent parents create no durable child files.

## Evidence

- Installed Pi `docs/sdk.md`, `docs/session-format.md`, `docs/sessions.md`, and `docs/extensions.md`: native session history, branch-aware tool-result state, compaction, and retention.
- Installed Pi `examples/sdk/11-sessions.ts`: explicit session-manager selection and session disposal.
- Installed Pi `dist/core/session-manager.d.ts` and `.js`: `SessionManager.inMemory(cwd, options, entries)`, raw branch access, and `createBranchedSession()` copying retained entry payloads.
- Installed Pi `dist/core/agent-session-runtime.js`: `fork()` uses the selected entry's parent for `position: "before"`, and the entry itself for `position: "at"`.
- Installed Pi `dist/modes/interactive/interactive-mode.js`: `/clone` forks at the active leaf.
- `packages/supi-agent-runtime/src/run.ts` and `context.ts`: restored in-memory session creation, finalized context capture, and terminal disposal.
- `packages/supi-agent-runtime/src/usage.ts`: run-only Usage accounting with an imported-history baseline.
- `packages/supi-agent/src/delegation/controller.ts` and `usage-receipts.ts`: current live batch ownership and stored-result accounting.
- [Background delegation](background-delegation.md): existing execution, mode, capacity, cancellation, and collection rules.
- [Checkpoint persistence decision](adr/0011-store-delegation-checkpoints-with-parent-results.md): accepted storage and retention trade-off.
