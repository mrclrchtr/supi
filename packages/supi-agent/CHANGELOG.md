# Changelog

## [14.0.0]

- The `explore` profile gets a read-only `git` tool for diffs, history, and blame, for example `{ "args": ["diff", "main...HEAD", "--stat"] }`. It runs without a shell, admits only `diff`, `log`, `show`, `blame`, `status`, `rev-parse`, and `ls-files`, and rejects options that write files or run configured diff programs. Explorers stay read-only, so they still run in parallel and in the background. Custom profiles can add `git` to their `tools` list.
- The `explore` and `general` system prompts are rewritten for delegated work. They name the calling agent as the reader, ask for narrowed searches and confirmed paths, and say what the final message must contain. `general` now looks up the project's own format, lint, and test commands first, reads a referenced `SKILL.md` itself because skills are not loaded, and commits only when the task asks for it.
- Agent Runs with a package-owned or custom system prompt now receive the usage rules of their active tools in a `<tool_rules>` section. Before, those rules reached only profiles with `systemPrompt: "native"`.
- `code_orientation` no longer repeats instruction files an Agent Run already has. A `general` run that loads the project `CLAUDE.md` into its system prompt got the same file again from the first directory orientation ([#612](https://github.com/mrclrchtr/supi/issues/612)).
- `agent_run` guides the calling agent toward better briefs: `instructions` asks for the task boundary and for known facts as exact paths, symbols, or excerpts, and two usage rules ask it to check what it passes and to keep reading lists short. A child that receives `sharedContext` now sees it and its own task under separate headings.
- The `git` tool explains empty output per subcommand, for example `(no output: no commits matched. …)`, and says that every revision resolved while paths are not checked for existence. A rejected first argument is named, for example `Option "-c" before the subcommand is not allowed`.
- Each profile has an **Instructions** row in `/supi-settings` that sets `instructionScopes`: `none`, `project`, `global`, or `global+project`. Use it to keep a global AGENTS.md out of delegated runs. Run `/reload` to apply a change.

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
