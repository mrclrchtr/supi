# Changelog

## [12.1.0]

- `agent_run` accepts `new: { profile, cwd }` to start a conversation in another worktree of the same Git repository. The child session, its instruction files, and its system-prompt cwd use that directory; project trust is inherited from the parent. Follow-ups keep the directory. Relative paths, missing directories, and directories outside the parent's repository fail preflight before any task starts. The child prompt names the directory and says it overrides any other working directory in the environment, because some providers describe the parent's cwd.

## [12.0.0]

- While `agent_result` waits, its row now shows each task's live status and activity instead of a static "Waiting for Agent Run results…" line.
- Child sessions use the bundled Code Intelligence 12.0.0: `code_refactor_plan` takes per-operation scopes (`rename_symbol`, `code_action`, `source_action`), `code_find` takes a `search` selector with `scopes`, `code_inspect` takes `anchor`, and structural analysis is faster and more accurate on large files ([#583](https://github.com/mrclrchtr/supi/issues/583)).
- The `agent_*` tools now declare audited `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` annotations for permission extensions. `agent_run` is marked destructive and open-world because child sessions may get shell, edit, and Web tools ([#582](https://github.com/mrclrchtr/supi/issues/582)).

## [11.4.0]

- Agent Run retrospectives (opt-in via `debug.agentRunRetrospectivesEnabled`) now also ask about Code Intelligence (`code_*`) results that were incomplete, oversized, ambiguous, or failed, and record a `promptRevision` so older and newer reports can be told apart.

## [11.3.0]

- Agent Profiles can allow `supi-web` tools individually; `explore` and `general` allow all four. Runs receive them only when the loaded Web extension provides them, without a bundled dependency.
- Added package-specific release notes for Agent Run delegation and saved conversations.
