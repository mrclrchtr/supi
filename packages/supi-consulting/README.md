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

Set `workspace` to `true` only when the Consultation needs repository evidence. This exposes the current PI workspace. Set it to `false` to use the empty Consultation Workspace. Explicitly configured additional read-only directories remain accessible with either selection.

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

## Additional read-only directories

Use `/supi-settings` → **Consulting** → **Additional read-only directories** to enter comma-separated absolute directory paths. The default is an empty list. No shell expansion or glob matching is performed. For paths containing commas, edit the JSON configuration instead.

Global configuration lives at `~/.pi/agent/supi/config.json`; project configuration lives at `.pi/supi/config.json`:

```json
{
  "consulting": {
    "additionalReadOnlyDirectories": ["/tmp/octalog-filter-previews"]
  }
}
```

- Project values replace the global list, rather than extending it. An explicit `[]` removes inherited grants; Inherit/Reset deletes the scoped key. Untrusted project configuration cannot grant access; global grants still apply.
- Directories must exist and be accessible when a Consultation starts. Symlinks are resolved and duplicate roots are removed, so `/tmp` resolves to `/private/tmp` on macOS without needing both entries.
- Settings are read from the current Pi workspace before each new Consultation and follow-up. Changes apply to the next invocation without reloading. They do not modify an already-running process.
- The directories are registered with Antigravity per process using `--add-dir`, not persisted as permission grants in the shared profile. The fixed write, command, MCP, and URL-execution denials remain in force; `allowNonWorkspaceAccess` stays `false`.
- Configured directories are available even with `workspace: false`. Prefer task-specific artifact folders over all of `/tmp`, which may contain unrelated sensitive files. This setting does not authorize shell-based browser automation.
- Reads from extra directories can contribute inspection activity, but references outside the selected workspace are not reported as validated workspace-relative evidence.

Directory registration and deny-rule precedence follow Antigravity's [CLI reference](https://antigravity.google/docs/cli/reference/) and [permissions reference](https://antigravity.google/docs/permissions/). These are Antigravity policy restrictions, not a new operating-system security boundary.

## Failure diagnostics

Execution failures report a fixed reason when the adapter can identify it:

- Missing final result, missing structured answer, answer schema mismatch, or an answer not bound to the current request.
- Unsuccessful final result or data received after the final result.
- Malformed JSON, a non-object event, or an output limit exceeded.
- Missing conversation identifier, process failure, timeout, or cancellation.

Each invocation adds a unique response token to its private answer schema and validates the returned token locally before accepting the answer. The token is removed from public results and excluded from failure diagnostics. This prevents a resumed Antigravity conversation's previous structured answer from being accepted as the current result. Missing or mismatched tokens fail with `unbound-answer`; plain-text answers are not substituted for the structured contract. A started follow-up that fails retires its Conversation Handle; start a new Consultation.

An observed tool permission denial is reported separately. It does not prove the cause of a later failure. A denial does not fail a Consultation that returns a valid answer. Workspace Access alone does not grant access to files outside the selected workspace; configure additional read-only directories explicitly.

Failure messages returned to the calling agent include the observed terminal status and denial counts by fixed operation category (`command`, `file-read`, `file-write`, `web-read`, `browser`, `mcp`, or `other`). They distinguish a successful agent terminal status from a usable final answer and recommend permitted inspection or a limited/blocked report rather than repeating denied actions unchanged. This feedback remains available when Debug is disabled.

When SuPi Debug is enabled, failed executions emit one `consulting/consultation.failed` event at `error` level. Cancellations emit `consulting/consultation.cancelled` at `info` level. Use the `debug` tool:

```json
{ "source": "consulting", "level": "error", "limit": 10 }
```

Omit `level` to include cancellations. Add `sessionFile` to inspect events persisted in a saved PI session. A response aborted before the adapter starts has no Consulting event.

Events contain the execution phase, timing, selected model, workspace-access and follow-up flags, failure category and reason, and available event counts, terminal-state flags, permission-denial count, and exit code. `permissionDenialsByOperation` breaks down deduplicated denials by fixed category; unknown tool names become `other`. `deniedFileAccessOutsideReadRoots` counts denied file operations whose requested paths resolve outside the selected directory and configured additional read-only directories, following symlinks and existing parents of missing targets. Unavailable path information, dangling symlink destinations, and paths containing parent traversal (`..`) remain unclassified rather than risking an incorrect outside-root claim. This location observation does not identify which rule caused a denial.

Antigravity's terminal `denied_actions` summary can establish a denial even when its detailed tool-error update is absent. It establishes a minimum of one observation per operation category, not additional calls on top of already-correlated denials. Summary entries have no tool-call IDs or file parameters, so the adapter does not attribute them to nearby or unfinished file requests.

Failures also include bounded requested file-target metadata in both Debug and caller-visible feedback:

- `deniedResources` lists at most eight distinct `{ operation, requestedPath }` references for known file operations observed as denied. Targets come from structured parameters on the denied event or earlier updates correlated by tool-call ID, never from error text, command parsing, nearby calls, or transcripts.
- `requestedPath` preserves the supplied path, including significant whitespace. It is not a canonical filesystem path or the permission checker's resolved target, and does not identify a permanent path blacklist or the denying rule. Paths are limited to 1,024 UTF-16 characters; longer paths are unavailable rather than silently shortened.
- `deniedResourcesOmitted` counts file-denial observations whose known targets were omitted because the list was full, not unique omitted paths. Repeated denials for listed targets do not duplicate entries.
- `deniedResourcePathsUnavailable` counts known file-denial observations without an available, bounded structured target. Missing correlation or parameters remain unknown; the adapter does not infer a path from prose. Explicit replacement targets supersede earlier metadata, including when the replacement is invalid or overlong; only omitted path parameters preserve an earlier target.
- `unfinishedResources` separately lists at most eight distinct requested targets from ID-correlated file calls with no observed terminal outcome. These are **unknown outcomes, not confirmed denials**, even if a terminal summary reports the same operation category. Successful and already-denied calls are excluded. `unfinishedResourcesOmitted` counts capacity-omitted observations; `unfinishedResourcePathsUnavailable` counts observations lacking a usable target. The same path limits, replacement semantics, and deduplication rules apply as for denied resources.
- Caller-visible references are JSON-quoted, with terminal control characters and line separators escaped. **Denied and unfinished requested paths can contain sensitive metadata and are exposed to the calling agent and persisted with enabled Debug events.**

Events otherwise exclude prompts, answers, arbitrary tool names, raw stdout, stderr, complete tool payloads, and error causes, even when raw Debug access is enabled. The event's `cwd` identifies the selected working directory. Successful Consultations do not gain a failure event merely because an action was denied.

## Security limits

The Antigravity adapter enforces its Inspection Permission Set in the Isolated Antigravity Home. It allows `read_url(*)` and denies known file writes, commands, MCP, and URL execution. The `command(*)` rule covers commands inside and outside Antigravity's terminal sandbox; the obsolete, ignored `unsandboxed(*)` rule is not emitted. These rules are **not an operating-system sandbox**.

For Consultations with Workspace Access or additional read-only directories, project-local hooks can run commands, read the Antigravity transcript, and cause side effects outside these permission rules. The adapter probes hook state with the additional roots before the paid process and warns when hooks are active or unknown. Directory grants are intended for inspection artifacts, not untrusted project customizations.

`read_url(*)` can reach local, private-network, and link-local endpoints that Antigravity accepts. It does not enforce public-internet-only access.

These limits describe the Antigravity integration. The private adapter interface does not promise that future agents have the same permissions or isolation. There is no `supi-agent-runtime` integration in this package.

## Development and live probe

The repository's [rename plan](https://github.com/mrclrchtr/supi/blob/main/packages/supi-consulting/CONSULTING-RENAME-PLAN.md) records the approved scope and verification criteria. Its [original plan](https://github.com/mrclrchtr/supi/blob/main/packages/supi-consulting/PLAN.md) is the historical Antigravity specification, not the current tool contract.

The live probe requires separate approval and sign-in. It never runs in normal tests or CI:

```bash
SUPI_CONSULTING_LIVE=1 pnpm exec jiti packages/supi-consulting/scripts/live-probe.ts
```

It uses the isolated profile and checks web evidence, follow-up context, workspace evidence, and byte-identical fixture state.
