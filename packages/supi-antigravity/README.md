# @mrclrchtr/supi-antigravity

`@mrclrchtr/supi-antigravity` adds the beta `antigravity_run` tool to Pi. It runs bounded Antigravity consultations with an explicit Model Catalogue, optional current-workspace access, controlled web use, and observed evidence.

## Install

```bash
pi install npm:@mrclrchtr/supi-antigravity
```

The package is not part of the recommended or full SuPi installer. Install it only when you want the Antigravity integration.

Run `/reload` after installation.

## First sign-in

The package never uses the normal Antigravity profile. It creates an Isolated Antigravity Home under the Pi agent directory and a stable empty Consultation Workspace.

Before the tool can appear, Pi shows a command like this:

```bash
cd "<consultation-workspace>" &&
HOME="<isolated-home>" AGY_CLI_DISABLE_AUTO_UPDATE=true agy
```

Run the command, sign in, exit Antigravity, and reload Pi. The installed `agy` version must be at least `1.1.24`.

## `antigravity_run`

A new run has this shape:

```json
{
  "prompt": "Explain this API design.",
  "new": {
    "workspace": false,
    "model": "gemini-3.8-flash-low"
  }
}
```

Set `workspace` to `true` to expose the current PI workspace. Set it to `false` to use the empty Consultation Workspace. A follow-up must use exactly one returned Conversation Handle:

```json
{
  "prompt": "Now compare the alternatives.",
  "continue": { "handle": "agy_..." }
}
```

Follow-ups keep the original model and workspace. A handle is opaque, branch-aware, and retired after a started follow-up fails or is canceled.

The result reports web use, workspace use, observed and claimed references, warnings, token use, and the Conversation Handle. Antigravity can return a claimed reference without producing matching tool activity; SuPi labels it as claimed instead of observed.

## Security limits

The Isolated Antigravity Home enforces an Inspection Permission Set. It allows `read_url(*)` and denies file writes, commands, unsandboxed actions, MCP, and URL execution. These rules are not an operating-system sandbox.

For workspace runs, project-local hooks can run commands, read the Antigravity transcript, and cause side effects outside these permission rules. SuPi probes hook state before the paid process and warns when hooks are active or unknown.

`read_url(*)` can reach local, private-network, and link-local endpoints that Antigravity accepts. It does not enforce public-internet-only access.

Use `/supi-settings` to disable the tool. Disabling it skips availability checks and removes `antigravity_run` from the active tool list.

## Live probe

The live probe is opt-in and never runs during normal tests or CI:

```bash
SUPI_ANTIGRAVITY_LIVE=1 pnpm exec jiti packages/supi-antigravity/scripts/live-probe.ts
```

It uses the isolated profile and checks web evidence, follow-up context, workspace evidence, and byte-identical fixture state.
