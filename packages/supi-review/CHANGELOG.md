# Changelog

## [16.0.0]

- **Breaking:** `review_run` tasks no longer accept `criteriaSources`. Migration: move each entry into the task's `instructions`, naming the source and quoting the rules that apply.
- Every Reviewer Packet now carries the repository's instruction files. The workspace-root `CLAUDE.md` or `AGENTS.md` is embedded in full. The nearest one in each directory above a changed path or a `paths` entry is listed with its SHA-256, line count, whether the change modifies it, and which changed or `paths` entries it covers; Reviewers are asked to get those rules through `code_orientation` on the directory, or to read the file, before judging code there. Before, Reviewers saw instruction files only when they happened to call `code_orientation`. File names come from your `code-intelligence.instructionFileNames`; the reviewed change cannot alter them. A root instruction file above 100,000 bytes fails the Review before it starts. With **Debug → Enabled**, each `review-task` event counts how many listed files the Reviewer reached through `code_orientation`, a full `read`, or a `bash` command ([#668](https://github.com/mrclrchtr/supi/issues/668)).
- **Breaking:** `/supi-review-cleanup` is replaced by `/supi-agent-cleanup`, which the Review and Agent extensions share. It lists every SuPi-marked worktree with its owner status, including Review Workspaces from older versions. For a worktree whose owner process has exited, it removes Review Workspaces and other disposable workspaces and only unlocks worktrees it did not create. Worktrees of a running session are reported and left alone. Migration: run `/supi-agent-cleanup` instead of `/supi-review-cleanup`, and update scripts or notes that name the old command ([#677](https://github.com/mrclrchtr/supi/issues/677)).

## [15.0.0]

- Reviewer retrospectives keep the Reviewer's tools declared and block calls instead of removing them, so the system prompt and tool list stay unchanged and the run is read from the prompt cache on every model.
- **Breaking:** in TUI and RPC, `review_run` now starts a Background Review by default. The call returns once the Review Target is frozen and any Dependency Bootstrap has finished, with a `batchId`, the task ids, and the Workspace Receipt instead of the report, so the Agent and the user can continue. One Completion Notice arrives when every Review Task is finished; the report, its Post-Review Policy, and the Reviewer Usage come from `agent_result`. `agent_cancel` stops a running Review, and the status line shows active Background Reviews. Print and JSON modes still wait for the report and reject `mode: "background"`. `/supi-review` is unchanged. Migration: pass `mode: "foreground"` to `review_run` to keep waiting for the report in the call ([#636](https://github.com/mrclrchtr/supi/issues/636)).
- The **Agent tools** setting also turns `agent_result` and `agent_cancel` off, unless the Agent extension still needs them.
- Reviewers now see the usage rules of their tools, such as when to use `code_resolve` instead of `rg`. The Reviewer Protocol replaced Pi's prompt, and with it the rules section Pi builds only for its own prompt ([#667](https://github.com/mrclrchtr/supi/issues/667)).
- Reviewer replays (`review.auditEnabled`) record the system prompts the Reviewer actually received in `trace.systemPrompts`, including sections Pi adds to the Reviewer Protocol such as `<tool_rules>` and `<shell>`. `protocolPrompt` keeps only the package-owned protocol text.
- Reviewer and Planner sessions now retry transient provider failures, such as rate limits or overload, instead of failing the Review Task, and compact their context instead of failing when it outgrows the model's context window. With **Debug → Enabled**, each compaction records an `agent-run-compaction` Debug event, so a Review that needed one can be analyzed.
- In RPC, the Foreground Review status line is sent once per progress change instead of about twelve times per second; the TUI animation is unchanged. A finished Review now removes its status entry instead of leaving an empty one ([#663](https://github.com/mrclrchtr/supi/issues/663)).
- `/agents` fits the run name column to the longest name (24–64 columns), so long run names are no longer cut after about 30 characters.
- With **Debug → Enabled**, each Completion Notice of a background Run Batch is recorded as a Debug event, `sent` or `skipped` because its result was already collected, so the `debug` tool can tell whether a notice was delivered.

## [14.3.0]

- Reviewer Run retrospective Debug events record which tools the run started with (`metrics.availableTools`), so a tool the task did not use can be told apart from one it did not have. The retrospective prompt (revision 3) no longer asks every run to comment on Code Intelligence: a run mentions `code_*` tools only for a faulty result or when it answered a symbol question with another tool.

## [14.2.0]

- Change reviews get the complete target change as a file. The Review Engine saves it as `target.diff` beside the Review Workspace, and the Reviewer Packet names it and adds the line where each changed path starts, for example `(diff line 412)`. Reviewers page it with `read`, which keeps the start of a long file. Before, a large `git diff` through `bash` returned only its last 50 KB and Reviewers fetched the start again. Binary changes take one line each.
- The Reviewer Packet states whether the configured Dependency Bootstrap ran. Without one, Reviewers looked for `node_modules` over several calls before noticing it was absent.
- Reviewer Run retrospective Debug events now carry `metrics` for the assessed task: wall-clock duration, turns, tool executions and errors, executions per tool name, and task-only Usage. Self-reported friction can now be compared with measured cost.
- Sessions with `bash` learn which `sed` it runs. SuPi runs `sed --version` once through the same shell as the bash tool, including `shellPath` and `shellCommandPrefix`, and adds the result as a `<shell>` section of the system prompt: GNU sed takes `sed -i 's/a/b/' file`, BSD sed (macOS default) needs `sed -i '' ...`. This replaces the hint that appeared after the first BSD sed error, which never fired with GNU sed installed. Reviewers get the rule too.

## [14.1.0]

- The changed-path manifest in a Reviewer Packet now lists up to 200 paths for ordinary path lengths. Before, a character budget cut a 154-file change at 102 paths and hid directories the review focused on. When paths are still omitted, the manifest names the exact Git command that lists them all.
- `review_run` warns when `from` is not an ancestor of the reviewed state, for example a base branch tip instead of the merge base. The target is unchanged, but the result and the Reviewer Packet name the merge base and say that the change also reverses commits only `from` contains. The `target` description now asks for the merge base for branch work.
- Reviewers apply a length limit from the Review Task to the summary and keep each finding as its own entry with its evidence. Before, "under 400 words" made Reviewers merge separate findings.
- Reviewer child sessions use the bundled Code Intelligence 14.1.0: `code_graph` shows the source line of each reference, `code_graph` and `code_find` show up to 50 results by default, target handles are 12 decimal digits, and nested arguments sent as JSON strings are accepted.

## [14.0.0]

- `review_run` asks callers to put the applicable criteria into each `criteriaSources` summary, quoted or closely paraphrased, and Reviewers retrieve a source only for what its summary lacks. One-line topic summaries made Reviewers read every source anyway.
- `code_orientation` no longer repeats an instruction file a Reviewer already read in full, and delivers instruction files again after a compaction ([#612](https://github.com/mrclrchtr/supi/issues/612)).
- `/supi-review-cleanup` reports one status row per workspace (`✓` removed, `✗` with the failure reason) instead of the raw `[supi-review-cleanup]` message.
- The Agent Run transcript (`/supi-agents`) of a Reviewer Session lists only the system prompts sent with a model request; before, one run could show up to four "Effective system prompt" entries ([#611](https://github.com/mrclrchtr/supi/issues/611)).

## [13.0.0]

- Reviews of a working tree with many untracked files start much faster. Their patches now come from one `git diff` instead of several Git processes per file; 205 untracked files took 0.5 s instead of 4.8 s. The repository's object store is not written.
- When a `bash` result shows a BSD sed script error (macOS `sed: 1: ...`), the first one in a session gets a one-line hint: `sed -i` needs a suffix argument, the delimiter must not occur in the pattern, and the edit tool or `gsed` are alternatives. Reviewers and the parent session both get it.
- The Reviewer protocol names the frozen Review Workspace path and says it overrides any other working directory in the environment. Providers such as `claude-code` describe the parent worktree as the working directory, so reviewers prefixed every command with `cd`.
- Reviewer child sessions use the bundled Code Intelligence 13.0.0: `code_*` evidence lists report `completeness`, `code_health` no longer reports a clean result when nothing was checked or files changed on disk, and Maven and CMake projects appear in Workspace Overviews.

## [12.0.0]

- Codemode now lists `review_output` and `review_audit` under a `review` namespace heading, so scripts can find them with `describeNamespace("review")` or `searchTools(query, { namespace: "review" })`. Every Review tool, including the Reviewer child tools, now declares audited `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` annotations, which permission extensions can read from `pi.getAllTools()` ([#582](https://github.com/mrclrchtr/supi/issues/582)).
- Reviewer child sessions use the bundled Code Intelligence 12.0.0, so AST lookups on large files are much faster and Java, Kotlin, Ruby, and JavaScript/TypeScript export and call results are more accurate. Reviewers call `code_find` with a `search` selector and `scopes`, and `code_inspect` with `anchor`.

## [11.4.0]

- Reviewer Run retrospectives (opt-in via `debug.agentRunRetrospectivesEnabled`) now also ask about Code Intelligence (`code_*`) results that were incomplete, oversized, ambiguous, or failed, and record a `promptRevision` so older and newer reports can be told apart.

## [11.3.0]

- Added opt-in `review.reviewerWebEnabled`: Reviewer investigation can use the Web tools the session provides, as untrusted support that never replaces Target Evidence.
- Added package-specific release notes for inspection-only code reviews.
