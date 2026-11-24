# Changelog

## [16.0.0]

- Writers can run in parallel. A task with a mutation-capable profile such as `general` that runs in its own linked worktree (`new: { profile, cwd }`) now leases that worktree and runs like a read-only task: in multi-task batches next to other writers and read-only tasks, and in the background by default in TUI and RPC. A writer in the parent's worktree or the main worktree keeps the single-task foreground rule. A batch is rejected before any task starts when two writers target one worktree, or when another session, another tool, or an orphaned SuPi lock holds it; run `/supi-agent-cleanup` for orphaned locks. `git worktree list` shows the SuPi owner of a leased worktree, which is unlocked but kept when the run ends, and the task result names the writer's working directory. A lease is not a sandbox: worktrees still share Git refs, the stash, Git config and hooks, ports, and temporary directories ([#672](https://github.com/mrclrchtr/supi/issues/672)).
- `/supi-agent-cleanup` lists SuPi-marked worktrees with their owner status. For a worktree whose owner process has exited, it removes disposable workspaces and only unlocks worktrees it did not create ([#677](https://github.com/mrclrchtr/supi/issues/677)).

## [15.0.0]

- Agent Run retrospectives keep the run's tools declared and block calls instead of removing them. The system prompt and tool list stay unchanged, so models without mid-conversation system messages, such as DeepSeek, read the run from the prompt cache instead of re-reading it uncached.
- With **Debug → Enabled**, each context compaction of an Agent Run records an `agent-run-compaction` Debug event with the run, the reason, and the context size before and after, without conversation content.
- `/agents` fits the run name column to the longest name (24–64 columns), so long run names are no longer cut after about 30 characters.
- With **Debug → Enabled**, each Completion Notice of a background Run Batch is recorded as a Debug event, `sent` or `skipped` because its result was already collected, so the `debug` tool can tell whether a notice was delivered.

## [14.3.0]

- Agent Run retrospective Debug events record which tools the run started with (`metrics.availableTools`), so a tool the task did not use can be told apart from one it did not have. The retrospective prompt (revision 3) no longer asks every run to comment on Code Intelligence: a run mentions `code_*` tools only for a faulty result or when it answered a symbol question with another tool.

## [14.2.0]

- The `explore` profile now loads project instruction files (AGENTS.md or CLAUDE.md) by default, so explorers know repository facts such as the dependency layout. Global instruction files stay excluded. To restore the old behavior, set the profile's **Instructions** row in `/supi-settings` to `none`.
- Agent Run retrospective Debug events now carry `metrics` for the assessed task: wall-clock duration, turns, tool executions and errors, executions per tool name, and task-only Usage. Self-reported friction can now be compared with measured cost.
- Sessions with `bash` learn which `sed` it runs. SuPi runs `sed --version` once through the same shell as the bash tool, including `shellPath` and `shellCommandPrefix`, and adds the result as a `<shell>` section of the system prompt: GNU sed takes `sed -i 's/a/b/' file`, BSD sed (macOS default) needs `sed -i '' ...`. This replaces the hint that appeared after the first BSD sed error, which never fired with GNU sed installed. Delegated runs get the rule too.

## [14.1.0]

- The `explore` system prompt says how a length limit applies to a sourced answer: the limit covers the prose, and required sources go once into a numbered list after it. Before, runs asked for "about 900 words" with a URL on every claim could not meet both.
- Child sessions use the bundled Code Intelligence 14.1.0: `code_graph` shows the source line of each reference, `code_graph` and `code_find` show up to 50 results by default, target handles are 12 decimal digits, and nested arguments sent as JSON strings are accepted.

## [14.0.0]

- The `explore` profile gets a read-only `git` tool for diffs, history, and blame, for example `{ "args": ["diff", "main...HEAD", "--stat"] }`. It runs without a shell, admits only `diff`, `log`, `show`, `blame`, `status`, `rev-parse`, and `ls-files`, and rejects options that write files or run configured diff programs. Explorers stay read-only, so they still run in parallel and in the background. Custom profiles can add `git` to their `tools` list.
- The `explore` and `general` system prompts are rewritten for delegated work. They name the calling agent as the reader, ask for narrowed searches and confirmed paths, and say what the final message must contain. `general` now looks up the project's own format, lint, and test commands first, reads a referenced `SKILL.md` itself because skills are not loaded, and commits only when the task asks for it.
- Agent Runs with a package-owned or custom system prompt now receive the usage rules of their active tools in a `<tool_rules>` section. Before, those rules reached only profiles with `systemPrompt: "native"`.
- `code_orientation` no longer repeats instruction files an Agent Run already has. A `general` run that loads the project `CLAUDE.md` into its system prompt got the same file again from the first directory orientation ([#612](https://github.com/mrclrchtr/supi/issues/612)).
- `agent_run` guides the calling agent toward better briefs: `instructions` asks for the task boundary and for known facts as exact paths, symbols, or excerpts, and two usage rules ask it to check what it passes and to keep reading lists short. A child that receives `sharedContext` now sees it and its own task under separate headings.
- The `git` tool explains empty output per subcommand, for example `(no output: no commits matched. …)`, and says that every revision resolved while paths are not checked for existence. A rejected first argument is named, for example `Option "-c" before the subcommand is not allowed`.
- Each profile has an **Instructions** row in `/supi-settings` that sets `instructionScopes`: `none`, `project`, `global`, or `global+project`. Use it to keep a global AGENTS.md out of delegated runs. Run `/reload` to apply a change.
- The Agent Run transcript lists only the system prompts sent with a model request. Before, one `explore` run showed four "Effective system prompt" entries, including an empty one and the base prompt without extension changes ([#611](https://github.com/mrclrchtr/supi/issues/611)).
- Run activity lines show Git format arguments unquoted: `--format=%h` instead of `'--format=%h'`.

## [13.0.0]

- Background completion notices now render as a compact status line per task (`✓ edge-mail (explore) · done`) instead of the raw `[supi-agent-completion]` message with batch UUID and model instructions. Expand the notice to see each task's final message and the batch ID. The text sent to the model is unchanged.
- `agent_result` and live `agent_run` progress use a compact layout: one short row per task (`✓ edge-mail (explore) · done · claude-opus-5-5 (high) · 9 turns · 23 tools · 48.2k tokens · $0.12`) and the latest activity on its own `↳` line. Expanding adds the conversation ID and all recent activity. Collected `agent_result` and finished `agent_run` output use the same row plus a one-line output preview while collapsed and the full output when expanded.
- When a `bash` result shows a BSD sed script error (macOS `sed: 1: ...`), the first one in a session gets a one-line hint: `sed -i` needs a suffix argument, the delimiter must not occur in the pattern, and the edit tool or `gsed` are alternatives. Delegated runs and the parent session both get it.
- `agent_run` accepts `new: { profile, cwd }` to start a conversation in another worktree of the same Git repository. The child session, its instruction files, and its system-prompt cwd use that directory; project trust is inherited from the parent. Follow-ups keep the directory. Relative paths, missing directories, and directories outside the parent's repository fail preflight before any task starts. The child prompt names the directory and says it overrides any other working directory in the environment, because some providers describe the parent's cwd.
- Truncated `agent_run` batch outputs are now written to one private per-user directory, `$TMPDIR/supi-<uid>/`, instead of a new `supi-*` directory per call. Identical content reuses one file. SuPi never deletes these files; the OS temp purge does ([#597](https://github.com/mrclrchtr/supi/issues/597)).
- Child sessions use the bundled Code Intelligence 13.0.0: `code_*` evidence lists report `completeness`, `code_health` no longer reports a clean result when nothing was checked or files changed on disk, and Maven and CMake projects appear in Workspace Overviews.

## [12.0.0]

- While `agent_result` waits, its row now shows each task's live status and activity instead of a static "Waiting for Agent Run results…" line.
- Child sessions use the bundled Code Intelligence 12.0.0: `code_refactor_plan` takes per-operation scopes (`rename_symbol`, `code_action`, `source_action`), `code_find` takes a `search` selector with `scopes`, `code_inspect` takes `anchor`, and structural analysis is faster and more accurate on large files ([#583](https://github.com/mrclrchtr/supi/issues/583)).
- The `agent_*` tools now declare audited `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` annotations for permission extensions. `agent_run` is marked destructive and open-world because child sessions may get shell, edit, and Web tools ([#582](https://github.com/mrclrchtr/supi/issues/582)).

## [11.4.0]

- Agent Run retrospectives (opt-in via `debug.agentRunRetrospectivesEnabled`) now also ask about Code Intelligence (`code_*`) results that were incomplete, oversized, ambiguous, or failed, and record a `promptRevision` so older and newer reports can be told apart.

## [11.3.0]

- Agent Profiles can allow `supi-web` tools individually; `explore` and `general` allow all four. Runs receive them only when the loaded Web extension provides them, without a bundled dependency.
- Added package-specific release notes for Agent Run delegation and saved conversations.
