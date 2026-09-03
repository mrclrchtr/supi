# Walking Skeleton implementation plan

## Public contract

Register one tool:

```ts
antigravity_run({
  prompt: string,
  new?: {
    workspace: boolean,
    model:
      | "gemini-3.8-flash-low"
      | "gemini-3.8-flash-medium"
      | "gemini-3.8-flash-high"
      | "gemini-3.1-pro-high"
  },
  continue?: {
    handle: string
  }
})
```

Require exactly one of `new` or `continue`.

Build the registered `new.model` `StringEnum` from the immutable discovered Model Catalogue. Runtime validation must use the same catalogue and reject an unavailable curated model.

- `workspace: false` uses the empty Consultation Workspace.
- `workspace: true` uses `ctx.cwd`.
- Follow-ups inherit the model and workspace from the Conversation Handle.
- Web use stays under Antigravity control. The result reports whether Antigravity used web tools.

## 1. Create the package

Add:

```text
packages/supi-antigravity/
  package.json
  README.md
  CLAUDE.md
  CONTEXT.md
  tsconfig.json
  vitest.config.ts
  docs/adr/
  src/
    extension.ts
    config.ts
    availability.ts
    isolated-home.ts
    process/
    conversation/
    tool/antigravity_run/
  __tests__/
    tsconfig.json
    helpers/
    fixtures/
    unit/
    integration/
  scripts/
    live-probe.ts
```

Do not add `src/api.ts` or `src/index.ts`. Export only:

- `./extension`
- `./package.json`

Add `@mrclrchtr/supi-core` to `dependencies` and `bundledDependencies`. Add Pi packages as `"*"` peer dependencies.

Also update:

- root `package.json` `pi.extensions`
- root README package catalog as **Beta** and **Agent**
- `release-please-config.json`
- `pnpm-lock.yaml`

Keep the package outside the "Recommended" Release and "All" Stack. It should not get installed via the install scripts.

## 2. Add the isolated environment

Use these package-owned paths:

```text
<PI agent dir>/supi/antigravity/home/
<PI agent dir>/supi/antigravity/consultation-workspace/
```

`isolated-home.ts` must:

1. Create both directories.
2. Initialize the Consultation Workspace as a stable empty Git project. Use an empty repository template so Git does not copy user template hooks.
3. Atomically merge `<isolated-home>/.gemini/antigravity-cli/settings.json`.
4. Preserve unknown settings.
5. Complete the merge before each `agy` probe or run starts.
6. Enforce:

```json
{
  "allowNonWorkspaceAccess": false,
  "permissions": {
    "allow": ["read_url(*)"],
    "deny": [
      "write_file(*)",
      "command(*)",
      "unsandboxed(*)",
      "mcp(*)",
      "execute_url(*)"
    ]
  }
}
```

Do not copy configuration or credentials from the normal Antigravity home.

When authentication is missing, show the resolved login command:

```bash
cd "<consultation-workspace>" &&
HOME="<isolated-home>" AGY_CLI_DISABLE_AUTO_UPDATE=true agy
```

Tell the user to exit Antigravity and reload PI after sign-in.

## 3. Add availability discovery

At `session_start`, when the Agent tools setting is enabled:

1. Run `agy --version`.
2. Require version `>=1.1.24`.
3. Run `agy models` inside the Isolated Antigravity Home.
4. Parse bounded tab-separated output.
5. Intersect the result with the four curated models.
6. Register `antigravity_run` only when at least one curated model is available.

Omit the tool and show a bounded warning when:

- `agy` is missing;
- the version is too old;
- authentication is unavailable;
- model discovery fails;
- no curated model is available.

Keep the discovered catalogue immutable until reload.

## 4. Register settings

Add one configuration field:

```ts
antigravity.agentToolEnabled: boolean
```

Default it to `true`.

Register it through the SuPi settings registry. When disabled:

- skip availability probes;
- remove `antigravity_run` from active tools;
- do not show authentication or installation warnings.

When enabled:

- reuse the current immutable catalogue when discovery already completed;
- otherwise, run the availability check and register or activate the tool;
- make the settings module `apply()` operation await this refresh before it resolves;
- use `defineConfigSettings()` for the fixed field and wrap its `apply()` operation for the asynchronous refresh;
- do not start the probe from the synchronous `afterPersist` callback;
- prevent an older in-flight refresh from activating the tool after a later disable action.

## 5. Build the process adapter

Spawn `agy` directly. Do not use a shell.

Use:

```text
--input-format stream-json
--output-format stream-json
--json-schema <temporary-schema-path>
--model <selected-model>
--print-timeout 5m
--sandbox
--disable-slash-commands
```

For workspace-access runs, also pass `--add-dir <canonical-working-directory>`. agy requires this explicit sandbox workspace registration. Do not pass it for Consultation Workspace runs.

For follow-ups, also use:

```text
--conversation <raw-antigravity-id>
```

Process behavior:

- Send one NDJSON `user` event through stdin.
- Close stdin after the message.
- Parse stdout one line at a time.
- Read stderr concurrently.
- Do not retain raw NDJSON, tool parameters, or tool output.
- Set `HOME=<isolated-home>` and `AGY_CLI_DISABLE_AUTO_UPDATE=true` for every `agy` process, including discovery and hook probes.
- Pass only the approved environment allowlist.
- Do not pass unrelated PI provider credentials.
- Enforce package-owned limits for bytes per stdout line, total events, and retained stderr. Detect an oversized line before unbounded newline buffering. Kill the process group and throw when a limit is exceeded.
- Use a detached POSIX process group.
- On cancellation, timeout, or parser failure, send `SIGTERM` to the process group, wait for a short grace period, then send `SIGKILL` to the process group.
- Remove the temporary schema file on success, failure, and cancellation.
- Support macOS and Linux only in this release.

Map non-success Antigravity statuses, malformed terminal events, invalid structured output, timeout, and process failures to real thrown tool failures.

## 6. Enforce structured output and evidence

Use an Antigravity JSON Schema with:

```ts
interface AntigravityAnswer {
  answer: string;
  sources: Array<{
    title: string;
    url: string;
  }>;
  workspaceEvidence: Array<{
    path: string;
    summary: string;
  }>;
}
```

Set field and item limits so the complete PI result stays below:

- 50 KB
- 2,000 lines

Validate:

- only `http:` and `https:` source URLs;
- workspace paths are relative and stay inside the selected workspace;
- evidence arrays have bounded counts;
- strings have explicit maximum lengths.

Classify web activity from successful events such as `search_web` and `read_url_content`. Classify workspace activity from observed file and code-search events.

Distinguish:

- **observed** source or workspace evidence;
- **claimed** references returned without corresponding tool activity;
- omitted invalid references.

A valid answer remains successful when some evidence degrades.

## 7. Add Conversation Handle state

For each successful new run:

1. Generate an opaque Conversation Handle.
2. Store its raw Antigravity ID, model, canonical working directory, Workspace Access, CLI version, and status in tool-result `details`.
3. Return the opaque handle in model-visible content.

For each successful follow-up, require the terminal Antigravity ID to match the stored ID and persist the current handle metadata and status in tool-result `details`.

Rebuild active handles from the current PI branch during `session_start` and `session_tree`.

For failed or canceled follow-ups that acquired the handle and started process work:

- retire the handle immediately;
- append a branch-aware retirement entry with `pi.appendEntry()`;
- do not expose the raw Antigravity ID.

Input, unknown-handle, retired-handle, and same-handle overlap rejections that occur before acquisition must not change handle state.

Concurrency rules:

- allow independent new runs in parallel;
- reject concurrent use of the same handle;
- do not queue sibling follow-ups;
- reject retired or unknown handles;
- do not permit model or workspace changes on a follow-up.

## 8. Add result assembly and rendering

Model-visible content should contain:

1. answer;
2. observed and claimed source lists;
3. workspace evidence;
4. warnings;
5. Conversation Handle.

Keep operational metadata in `details`:

- model;
- effective working-directory kind;
- CLI version;
- duration;
- token usage;
- observed tool names and counts;
- permission denials;
- active project-hook warning;
- raw Antigravity conversation ID;
- handle state.

Do not duplicate the answer in `details`.

Add compact renderers:

- call: tool name, safe bounded prompt preview, model when present, and workspace status;
- partial: model, workspace status, latest safe activity;
- collapsed: completion state, handle, evidence counts, token total;
- expanded: sources, workspace paths, warnings, and usage;
- error: bounded failure message.

The expanded renderer can render the bounded model-visible content as its Markdown body, but it must not parse that content to recover structured chrome. Build chrome from `details`. Handle missing or malformed `details` without an exception.

## 9. Handle ambient project behavior

For `workspace: true`:

- let Antigravity load project `AGENTS.md`, `GEMINI.md`, rules, and other project guidance;
- report that ambient project guidance was available;
- before the paid run, spawn a separate `agy -p "/hooks" --output-format json --print-timeout 15s` probe in the selected workspace with the Isolated Antigravity Home;
- do not pass `--disable-slash-commands` to the hook probe;
- parse bounded command output and reduce it to active project-local hook presence without retaining hook commands or raw configuration;
- if hook state is active or cannot be determined, show a warning before the paid process starts and include the warning in the result.

Document these Inspection Permission Set limitations:

- project hooks can run commands, read the Antigravity transcript, and cause side effects outside the permission rules;
- `read_url(*)` can reach local, private-network, and link-local endpoints that Antigravity accepts. It does not enforce public-internet-only access.

## 10. Add automated tests

Use a fake `agy` executable for normal tests.

### Unit tests

Cover:

- version parsing and minimum version;
- tab-separated model parsing;
- curated model intersection and a schema that rejects unavailable curated models;
- exact `new` versus `continue` validation;
- isolated settings merge and atomic write;
- Consultation Workspace initialization without user Git template hooks;
- environment allowlist, including the forced Isolated Antigravity Home;
- bounded NDJSON chunk and line parsing, event counts, and stderr capture;
- structured-output validation;
- URL and workspace-path validation;
- observed versus claimed evidence;
- 50 KB and 2,000-line result bounds;
- call and result renderer states, including malformed or absent `details`.

### Integration tests

Cover:

- successful new run;
- successful follow-up;
- branch-state reconstruction;
- handle retirement and non-retiring preflight rejections;
- same-handle overlap rejection;
- parallel independent runs;
- permission denial warnings;
- bounded hook discovery and pre-run warning behavior;
- malformed, missing, and oversized terminal events;
- non-success statuses and exit codes;
- timeout and cancellation;
- process-group cleanup;
- temporary-schema cleanup;
- missing and old executable behavior;
- settings activation, awaited refresh, and stale-refresh suppression;
- registration omission and warning behavior.

## 11. Add the opt-in live probe

Require an explicit variable such as:

```bash
SUPI_ANTIGRAVITY_LIVE=1
```

The script must never run in normal tests or CI by default.

Run three real calls with Gemini 3.8 Flash Low:

1. **Web consultation**
    - `workspace: false`
    - require successful web activity and valid source URLs.

2. **Conversation follow-up**
    - continue the first Conversation Handle;
    - verify that the answer uses prior conversation context.

3. **Workspace and web analysis**
    - inspect a TypeScript subprocess-cancellation fixture;
    - consult official Node documentation;
    - require workspace tool activity, web activity, valid paths, and valid URLs;
    - compare the complete fixture state before and after;
    - fail if any file changes.

## Acceptance criteria

The Walking Skeleton is complete when:

- `antigravity_run` is absent with clear guidance before isolated authentication.
- The tool appears after authentication and reload.
- Only available curated models enter its schema and pass runtime validation.
- New and follow-up inputs cannot conflict.
- Web consultation works without access to the current PI workspace.
- Workspace analysis uses both code and web evidence.
- The live fixture stays byte-identical.
- Follow-up context works through a Conversation Handle.
- Concurrent fresh runs work.
- Concurrent same-handle turns fail before process startup without retiring the in-flight handle.
- Failed follow-ups retire their handles across PI resume.
- Every `agy` process uses the Isolated Antigravity Home.
- Active or unknown project hook state produces a warning before a workspace run.
- No result exceeds 50 KB or 2,000 lines.
- SuPi does not copy raw stream or transcript data into PI session state or SuPi logs. Antigravity keeps its own transcript in the Isolated Antigravity Home for follow-ups.
- `pnpm verify:ai` passes.
- Package staging and tarball verification pass.

## Out of scope

- `supi-agent` integration
- `supi-agent-runtime` changes
- `supi-review` integration
- public library exports
- Windows support
- Gemini API-key authentication
- arbitrary models or CLI flags
- setup or cleanup commands
- persistent stdin processes
- real live cancellation probe
- SuPi replay or audit storage

Planning documents now exist at:

- `packages/supi-antigravity/CONTEXT.md`
- `packages/supi-antigravity/docs/adr/0001-use-an-isolated-antigravity-home.md`
- `CONTEXT-MAP.md`