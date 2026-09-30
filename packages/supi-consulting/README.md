# @mrclrchtr/supi-consulting

`@mrclrchtr/supi-consulting` adds the beta `consulting_run` tool to Pi. It runs bounded Consultations with explicit agent, model, and workspace selection and reports observed evidence. **Antigravity is the only supported Consulting Agent.**

## Install

```bash
pi install npm:@mrclrchtr/supi-consulting
```

The package is not part of the recommended or full SuPi installer. Run `/reload` after installation.

## Switch from supi-antigravity

This is a clean break. Remove the old package before you install the new one:

```bash
pi remove npm:@mrclrchtr/supi-antigravity
pi install npm:@mrclrchtr/supi-consulting
```

Use the same personal or project scope as the original install. Update local extension paths to `packages/supi-consulting/src/extension.ts`, then reload Pi.

- `antigravity_run` has no alias. Use `consulting_run` and supply `new.agent`.
- The setting is now `consulting.agentToolEnabled`. The old `antigravity` section is ignored, including an old disabled value. The new setting defaults to `true`; set it to `false` before reload if you want to skip discovery.
- Old Conversation Handles and tool results are not restored as consulting state. Start a new Consultation.
- The isolated home has moved to a new namespace. Sign in again. The package does not read, move, copy, or delete the old `<PI agent dir>/supi/antigravity/` data.

## First sign-in

The Antigravity adapter never uses the normal Antigravity profile. It creates these stable, agent-specific directories:

```text
<PI agent dir>/supi/consulting/antigravity/home/
<PI agent dir>/supi/consulting/antigravity/consultation-workspace/
```

After Pi starts, the package checks availability without making startup wait. The footer shows a spinning icon during the check. The tool appears only after discovery succeeds. The ready footer uses the terminal-safe `✦` icon; the SuPi footer shows it on the stats line as `| ✦`.

When sign-in is needed, Pi shows a command with the resolved paths:

```bash
cd "<consultation-workspace>" &&
HOME="<isolated-home>" AGY_CLI_DISABLE_AUTO_UPDATE=true agy
```

On macOS, the adapter creates and unlocks a private keychain inside the Isolated Antigravity Home. It exposes that keychain as the login keychain without prompting for the normal keychain password. Run the displayed command, sign in, exit Antigravity, and reload Pi. The installed `agy` version must be at least `1.1.24`.

If macOS displays `antigravity.` in a warning, the final `.` is sentence punctuation, not part of a keychain name.

## `consulting_run`

A new Consultation requires the agent, an available model, and Workspace Access:

```json
{
  "prompt": "Explain this API design.",
  "new": {
    "agent": "antigravity",
    "workspace": false,
    "model": "gemini-3.8-flash-low"
  }
}
```

The Model Catalogue is the intersection of the curated Antigravity models and the models available to the signed-in account. It stays fixed until the next session start or reload. There is no default model or automatic agent fallback.

Set `workspace` to `true` only when the Consultation needs repository evidence. This exposes the current PI workspace. Set it to `false` to use the empty Consultation Workspace.

A follow-up supplies only a returned Conversation Handle:

```json
{
  "prompt": "Now compare the alternatives.",
  "continue": { "handle": "consult_..." }
}
```

Supply exactly one of `new` and `continue`. Follow-ups retain the original agent, model, working directory, and Workspace Access. A handle is opaque and branch-aware. It is retired if a follow-up fails or is canceled after process work starts. Overlapping follow-ups on the same handle are rejected.

Results report web use, workspace use, observed and claimed references, warnings, token use, and the Conversation Handle. An answer can claim a reference without matching tool activity; SuPi labels that reference as claimed, not observed.

Use `/supi-settings` → **Consulting** to disable the tool. Disabling it skips availability checks and removes `consulting_run` from the active tool list.

## Security limits

The Antigravity adapter enforces its Inspection Permission Set in the Isolated Antigravity Home. It allows `read_url(*)` and denies known file writes, commands, unsandboxed actions, MCP, and URL execution. These rules are **not an operating-system sandbox**.

For workspace Consultations, project-local hooks can run commands, read the Antigravity transcript, and cause side effects outside these permission rules. The adapter probes hook state before the paid process and warns when hooks are active or unknown.

`read_url(*)` can reach local, private-network, and link-local endpoints that Antigravity accepts. It does not enforce public-internet-only access.

These limits describe the Antigravity integration. The private adapter interface does not promise that future agents have the same permissions or isolation. There is no `supi-agent-runtime` integration in this package.

## Development and live probe

The repository's [rename plan](https://github.com/mrclrchtr/supi/blob/main/packages/supi-consulting/CONSULTING-RENAME-PLAN.md) records the approved scope and verification criteria. Its [original plan](https://github.com/mrclrchtr/supi/blob/main/packages/supi-consulting/PLAN.md) is the historical Antigravity specification, not the current tool contract.

The live probe requires separate approval and sign-in. It never runs in normal tests or CI:

```bash
SUPI_CONSULTING_LIVE=1 pnpm exec jiti packages/supi-consulting/scripts/live-probe.ts
```

It uses the isolated profile and checks web evidence, follow-up context, workspace evidence, and byte-identical fixture state.
