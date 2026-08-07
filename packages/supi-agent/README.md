<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-agent">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-agent/assets/social-preview.png" alt="SuPi Agent" width="100%">
  </a>
</div>

# @mrclrchtr/supi-agent

Profile catalogue, field-level profile settings, and resource policy for foreground Agent Runs in PI.

This package is the policy layer for `@mrclrchtr/supi-agent-runtime`. It discovers Profile Directory sources from package defaults, `~/.pi/agent/supi/agents/`, and trusted project `.pi/supi/agents/` directories. It also contributes per-profile Model and Thinking rows to `/supi-settings`.

Built-in profiles:

- `explore` — read and headless Code Intelligence tools, no instruction files, read-only.
- `general` — read, bash, edit, write, and headless Code Intelligence tools, global/project instruction files, mutation-capable.

Profile sources overlay fields by ID with project → global → package precedence. A partial user manifest can pin only `model` or `thinking`; package tools and prompts continue to flow through. An invalid source falls through with a bounded diagnostic. Profiles are context-isolated, not permission- or filesystem-sandboxed.

## `/agents`

Use `/agents` in TUI mode to inspect active Agent Runs, the last completed Delegation Batch, effective Agent Profiles, and bounded Profile Diagnostics. The Runs view keeps task metadata separate from the bounded Conversation View. It shows lifecycle status, model, thinking level, turns, tool uses, Usage, safe tool activity, steering, assistant text, and retention notices.

- Use Tab or Left/Right to change sections.
- Use Up/Down to select a run, profile, or diagnostic.
- Use Page Up/Page Down to inspect retained conversation entries.
- Press `s` to steer the selected running Agent Run.
- Press `x` to stop only the selected starting or running Agent Run. A startup stop can wait for PI setup to finish.
- Press Esc to close the overlay. PI's normal outer-tool cancellation still stops the full Delegation Batch.

Other PI modes show only an unavailable notice. The overlay does not add a text control protocol, persistent child history, child JSONL, or replay files. Session shutdown clears its active and last-batch state.
