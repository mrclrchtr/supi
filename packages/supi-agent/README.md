<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-agent">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-agent/assets/social-preview.png" alt="SuPi Agent" width="100%">
  </a>
</div>

# @mrclrchtr/supi-agent

Profile catalogue and resource policy for foreground Agent Runs in PI.

This package is the policy layer for `@mrclrchtr/supi-agent-runtime`. It discovers self-contained profiles from package defaults, `~/.pi/agent/supi/agents/`, and trusted project `.pi/supi/agents/` directories. It currently registers the session-scoped catalogue; foreground delegation is delivered by the next slice.

Built-in profiles:

- `explore` — read and headless Code Intelligence tools, no instruction files, read-only.
- `general` — read, bash, edit, write, and headless Code Intelligence tools, global/project instruction files, mutation-capable.

Profile sources replace complete directories by ID. Invalid higher-precedence profiles shadow lower definitions and remain unavailable with bounded diagnostics. Profiles are context-isolated, not permission- or filesystem-sandboxed.
