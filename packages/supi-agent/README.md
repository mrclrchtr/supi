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
