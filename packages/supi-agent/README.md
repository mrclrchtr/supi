<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-agent">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-agent/assets/social-preview.png" alt="SuPi Agent" width="100%">
  </a>
</div>

# @mrclrchtr/supi-agent

[![GitHub stars](https://img.shields.io/github/stars/mrclrchtr/supi)](https://github.com/mrclrchtr/supi/stargazers) [![npm downloads](https://img.shields.io/npm/dm/@mrclrchtr/supi-agent)](https://www.npmjs.com/package/@mrclrchtr/supi-agent)

Profile catalogue, field-level profile settings, and resource policy for foreground Agent Runs in PI.

This package is the policy layer for `@mrclrchtr/supi-agent-runtime`. It discovers Profile Directory sources from package defaults, `~/.pi/agent/supi/agents/`, and trusted project `.pi/supi/agents/` directories. It also contributes per-profile Model and Thinking rows to `/supi-settings`.

Built-in profiles:

- `explore` — read and headless Code Intelligence tools, no instruction files, read-only.
- `general` — read, bash, edit, write, and headless Code Intelligence tools, global/project instruction files, mutation-capable.

Profile sources overlay fields by ID with project → global → package precedence. A partial user manifest can pin only `model` or `thinking`; package tools and prompts continue to flow through. An invalid source falls through with a bounded diagnostic. Profiles are context-isolated, not permission- or filesystem-sandboxed.

Changes to **Agent Run tool** and each profile's **Model** and **Thinking** settings apply immediately. `/agents` stays available when `agent_run` is off.

## Agent Run row

The `agent_run` transcript row shows the effective model of a Delegation Task as `model: provider/model-id`. It adds `thinking: <level>` when the run reports a thinking level. The live progress row, the collapsed result, and the expanded result show these facts first, followed by turns, tool uses, and Usage. A run without model data shows no model segment.

## `/agents`

Use `/agents` in TUI mode to inspect Agent and Reviewer runs in the current session. When this package is loaded, the viewer also shows effective Agent Profiles and bounded Profile Diagnostics. The viewer keeps the bounded Conversation View separate from the full human-only transcript. It shows status, model, thinking level, turns, tool uses, Usage, safe tool activity, steering, assistant text, and retention notices. Transcript messages stay outside parent tool results.

- Type in the run list to search. Use Up and Down to select a run, Profile, or diagnostic.
- In the run list, use Tab or Shift+Tab to switch between Agent and Reviewer runs. Use Enter to open a run.
- The selected run fills the viewer. The viewer does not use a split pane. Use Esc to return to the run list. Press Esc again to close the viewer.
- In an open run, use Tab to switch between Conversation and Details. Details shows run metadata, role and time headers, system prompts, and technical tool data.
- The viewer follows new transcript output by default (`LIVE`). Use Page Up and Page Down to scroll through wrapped lines. Page Up pauses auto-scroll (`PAUSED`); live updates keep the reading position. The status shows how many lines are below the view, not an unread count.
- Use Home to read earlier output. Open Details for task metadata. Use End to resume auto-scroll. Page Down also resumes auto-scroll when it reaches the end.
- Use the configured Pi thinking and tool-detail shortcuts (Ctrl+T and Ctrl+O by default). In Details, click a raw tool block to show or hide its input and output. These keys do not apply while you enter a steering message.
- The bounded Conversation View can omit old entries. The runtime-owned human-only transcript keeps captured messages for Agent and Reviewer runs until the containing session ends. Its retention does not depend on Review audit settings.
- Use `s` to steer the selected run when steering is available. A text field opens inside the viewer. Press Enter to send or Esc to cancel.
- Use `x` to request a stop for a starting or running Agent or Reviewer Run. Press Enter or `y` to confirm. A startup stop can wait for PI setup to finish. Stopping one Reviewer Run does not stop its sibling tasks.
- Mouse-wheel input scrolls the transcript or selects a run. Closing the viewer does not stop Agent Runs. PI's normal outer-tool cancellation still stops the full Delegation Batch.

Transcript files are temporary JSONL files in a private directory for the parent session. They have no application cap or restart recovery. A storage failure marks capture incomplete but does not stop a run. The viewer shows the available transcript and the incomplete status. Session shutdown removes the directory.

Other PI modes show only an unavailable notice. The overlay does not change global `tuiMode` or add a text control protocol, persistent child history, or replay files. Closing the viewer does not stop runs.
