<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-agent">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-agent/assets/social-preview.png" alt="SuPi Agent" width="100%">
  </a>
</div>

# @mrclrchtr/supi-agent

[![GitHub stars](https://img.shields.io/github/stars/mrclrchtr/supi)](https://github.com/mrclrchtr/supi/stargazers) [![npm downloads](https://img.shields.io/npm/dm/@mrclrchtr/supi-agent)](https://www.npmjs.com/package/@mrclrchtr/supi-agent)

Profile catalogue, field-level profile settings, and resource policy for background and foreground Agent Runs in Pi.

This package is the policy layer for `@mrclrchtr/supi-agent-runtime`. It discovers Profile Directory sources from package defaults, `~/.pi/agent/supi/agents/`, and trusted project `.pi/supi/agents/` directories. It also contributes per-profile Enabled, Model, and Thinking rows to `/supi-settings`.

Built-in profiles:

- `explore` — read and headless Code Intelligence tools, no instruction files, read-only.
- `general` — read, bash, edit, write, and headless Code Intelligence tools, global/project instruction files, mutation-capable.

Profile sources overlay fields by ID with project → global → package precedence. A partial user manifest can pin only `model` or `thinking`; package tools and prompts continue to flow through. An invalid source falls through with a bounded diagnostic. Profiles are context-isolated, not permission- or filesystem-sandboxed.

## Codemode opt-in

A Profile can opt into Pi codemode by adding `codemode` to its fixed `tools` list. The list is replaced as a whole when profile sources overlay, so a partial manifest must retain every capability it still needs:

```json
{
  "tools": ["read", "code_orientation", "code_find", "codemode"]
}
```

Package-provided profiles remain codemode-free by default. An opted-in child loads codemode with classifier and image-model APIs enabled and `mode: "on"`; its permitted direct tools remain available alongside scripts. Script discovery and nested calls are restricted to that Profile's permitted tools. No parent extensions or MCP servers are inherited. Codemode itself is non-mutating for batch classification; `bash`, `edit`, and `write` remain mutation-capable, so any Profile containing them is still single-task only.

Each top-level batch with opted-in tasks captures one snapshot of the containing session's currently available classifier and image models. The same snapshot is shared by opted-in siblings only; follow-up batches capture a fresh snapshot, and additions during a batch do not expand its authority. An empty catalogue leaves scripting available but authorizes no classifier or image models. Using these APIs may send supplied inputs—including repository evidence—to external providers and may incur provider costs. Availability does not guarantee provider entitlement or a successful request. Codemode and Profile isolation are not filesystem or operating-system sandboxes.

Changes to **Agent Run tool**, **Active Agent Run limit**, and each profile's **Model** and **Thinking** settings apply immediately. `/agents`, `agent_list`, `agent_result`, and `agent_cancel` stay available when new starts through `agent_run` are off.

## Background delegation

In TUI and RPC, `agent_run` defaults to background execution for read-only profiles such as `explore`. It returns a batch handle so the parent can continue independent work. Use `mode: "foreground"` to wait in the starting call. Mutation-capable profiles such as `general` default to foreground and reject explicit background requests. Print and JSON modes also default to foreground and reject explicit background requests.

- `agent_result({ batchId })` returns completed task results and pending status. Results are repeatable. When all available results, checkpoints, and Usage are already stored, it shows `Already collected; no new Usage.` Pending tasks can still remain. Do not poll.
- `agent_result({ batchId, wait: true })` waits for all tasks to finish.
- `agent_cancel({ batchId })` requests a stop for the active tasks in one background batch. Collect its terminal results afterward.
- Each task can produce a completion notice before its siblings finish. The notice reaches a busy parent at the next safe turn boundary, or starts a turn when the parent is idle. It contains identifiers and status, not task output. Notices for successfully collected tasks are omitted from later model requests; the human transcript is unchanged.
- The default limit is four active Agent Runs per session, counting foreground and background together. Set `agent.maxConcurrentRuns` in SuPi configuration or use **Active Agent Run limit** in `/supi-settings`. The value must be a positive integer. A batch that does not fit is rejected as a whole; there is no queue. Lowering the limit does not stop existing runs. Review limits are separate.
- Parent abort stops active background batches and pauses automatic delivery until a later user-originated prompt. Normal parent completion leaves them running. Idle Escape keeps Pi's normal editor behavior; use `/agents` to stop selected runs.
- Leaving the conversation branch that contains a batch's launch cancels active tasks. Compaction alone does not cancel them. Reload, session replacement, and shutdown stop owned runs and expire batch handles. Saved conversation checkpoints remain available; active work is not restored.
- Child Usage enters Pi's parent totals when Pi first stores a collection's Usage. A result hook can mark delivery as failed while preserving that Usage; retrying the output does not charge it again. Repeated collection does not count it again. `/agents` marks uncollected Usage: parent totals remain incomplete if results are never collected.
- Read-only runs share the parent's working directory. They do not read a frozen snapshot.

See the [background delegation design](docs/background-delegation.md) for the full contract.

## Resumable Agent Conversations

Start a new conversation with `new`, then use its conversation reference with `continue`:

```ts
agent_run({
  tasks: [{ id: "deployment", new: { profile: "explore" }, instructions: "Inspect deployment." }],
});

agent_run({
  tasks: [{ id: "secrets", continue: { conversationId: "<conversation reference>" }, instructions: "Check production secrets." }],
});
```

- `agent_list({ offset, limit })` lists saved conversations on the active parent branch. Rows show the reference, original task ID, Profile ID, and availability. It does not return child history.
- Each conversation keeps its original Profile ID. Every follow-up checks the current profile, model, tool, trust, and resource rules again.
- A follow-up starts a new Agent Run. It adds only its new instructions and shared context. It does not replay earlier tool calls or interrupted actions. It warns the child to check current files and treat earlier actions as uncertain after a non-success result.
- Pi saves child context in the stored `agent_run` result for foreground runs and the stored `agent_result` collection for background runs. Collect completed background work before you continue that conversation.
- Saved context is in parent tool-result details, not model-facing result text. Pi's branch navigation, forks, clones, and retention rules apply. Parent session files and exports can include child context and can become larger.
- Conversation references work only when their saved records are on the active branch. A missing, corrupt, or unsupported checkpoint blocks continuation. It does not start a new conversation silently.

See the [approved resumable conversation design](docs/resumable-conversations.md) for the full data and branch contract.

Provider-reported failures use `provider-error`. Results and debug events retain a bounded reason, such as `provider status 402 quota error`, when available. They do not retain raw error responses or credentials. Missing Usage is not a failure signal, and SuPi does not invent token or cost estimates.

## Enable or disable profiles

Use a profile's **Enabled** row in `/supi-settings`, or set `enabled` in its `profile.json`. For example, disable `general` globally in `~/.pi/agent/supi/agents/general/profile.json`:

```json
{ "enabled": false }
```

- `enabled` is an optional boolean. Omission inherits from the next source; the default is `true`.
- Project → global → package precedence applies. A trusted project's `enabled: true` can override a global `false`.
- Inherit/Reset removes the scoped field. Other manifest fields remain unchanged.
- Run `/reload` after a change. Enablement and profile choices stay fixed until the next session start or reload, including after direct file edits.
- Disabled profiles remain in settings. They are absent from model choices and cannot start new Agent Runs after the change takes effect.
- The model can select the first 32 sorted, enabled, valid Profile IDs. Disabled profiles do not use these slots.
- With no usable profiles, `agent_run` becomes inactive. Its saved **Agent Run tool** setting does not change. It becomes active again when a usable profile returns and the tool setting is on.
- Validation rules do not change: an invalid source is ignored as a whole, including its `enabled` value. A lower-precedence source can still enable the profile.

## Agent Run row

The `agent_run` transcript row shows the effective model of a Delegation Task as `model: provider/model-id`. It adds `thinking: <level>` when the run reports a thinking level. The live progress row, the collapsed result, and the expanded result show these facts first, followed by turns, tool uses, and Usage. A run without model data shows no model segment.

## `/agents`

Use `/agents` in TUI mode to inspect Agent and Reviewer runs in the current session. When this package is loaded, the viewer also shows effective Agent Profiles and bounded Profile Diagnostics. The viewer keeps the bounded Conversation View separate from the full human-only transcript. It shows status, model, thinking level, turns, tool uses, Usage, safe tool activity, steering, assistant text, and retention notices. Transcript messages stay outside parent tool results.

- Type in the run list to search. Use Up and Down to select a run, Profile, or diagnostic.
- In the run list, use Tab or Shift+Tab to switch between Agent and Reviewer runs. Use Enter to open a run.
- The selected run fills the viewer. The viewer does not use a split pane. Use Esc to return to the run list. Press Esc again to close the viewer.
- In Conversation or Details, use Alt+Left and Alt+Right to cycle through the filtered Agent or Reviewer runs. The viewer keeps the current view. A new Conversation follows the run's latest output.
- In an open run, use Tab to switch between Conversation and Details. Details shows run metadata, role and time headers, system prompts, and technical tool data.
- The viewer follows new transcript output by default (`LIVE`). Use Page Up and Page Down to scroll through wrapped lines. Page Up pauses auto-scroll (`PAUSED`); live updates keep the reading position. The status shows how many lines are below the view, not an unread count.
- Use Home to read earlier output. Open Details for task metadata. Use End to resume auto-scroll. Page Down also resumes auto-scroll when it reaches the end.
- Use the configured Pi thinking and tool-detail shortcuts (Ctrl+T and Ctrl+O by default). In Details, click a raw tool block to show or hide its input and output. These keys do not apply while you enter a steering message.
- The bounded Conversation View can omit old entries. The runtime-owned human-only transcript keeps captured messages for Agent and Reviewer runs until the containing session ends. Its retention does not depend on Review audit settings.
- Use `s` to steer the selected run when steering is available. A text field opens inside the viewer. Press Enter to send or Esc to cancel.
- Use `x` to request a stop for a starting or running Agent or Reviewer Run. Press Enter or `y` to confirm. A startup stop can wait for PI setup to finish. Stopping one Reviewer Run does not stop its sibling tasks.
- Mouse-wheel input scrolls the transcript or selects a run. Closing the viewer does not stop Agent Runs. Parent abort stops active background Delegation Batches; foreground tool cancellation stops that foreground batch.

Transcript files are temporary JSONL files in a private directory for the parent session. They have no application cap or restart recovery. A storage failure marks capture incomplete but does not stop a run. The viewer shows the available transcript and the incomplete status. Session shutdown removes the directory.

Other PI modes show only an unavailable notice. The overlay does not change global `tuiMode` or add a text control protocol, durable viewer transcripts, or replay files. Closing the viewer does not stop runs.
