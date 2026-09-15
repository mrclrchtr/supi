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

Use `/agents` in TUI mode to inspect active Agent Runs, the last completed Delegation Batch, effective Agent Profiles, and bounded Profile Diagnostics. The Runs view keeps task metadata separate from the bounded Conversation View. It shows lifecycle status, model, thinking level, turns, tool uses, Usage, safe tool activity, steering, assistant text, and retention notices.

- Use Tab, Shift+Tab, or Left/Right to change sections.
- Use Up/Down to select a run, profile, or diagnostic.
- The Runs view follows the latest retained output by default (`LIVE`). The run list and controls stay visible as the details scroll.
- Use Page Up/Page Down to scroll through wrapped output lines. Page Up pauses auto-scroll (`PAUSED`); live updates keep the retained entry in view. The status shows how many lines are below the view, not an unread count.
- Press Home to read task metadata and earlier output. Press End to resume auto-scroll. Page Down also resumes auto-scroll when it reaches the end.
- Press `f` to pause or resume auto-scroll. Selecting a different run resumes auto-scroll.
- The view fits the terminal height. If retention removes the entry you are reading, the view moves to the oldest available entry.
- Press `s` to steer the selected running Agent Run. A text field opens inside the overlay; press Enter to send or Esc to cancel.
- Press `x` to stop only the selected starting or running Agent Run. A startup stop can wait for PI setup to finish.
- Press Esc to close the overlay. PI's normal outer-tool cancellation still stops the full Delegation Batch.

Other PI modes show only an unavailable notice. The overlay does not add a text control protocol, persistent child history, child JSONL, or replay files. Session shutdown clears its active and last-batch state.
