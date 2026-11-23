# Changelog

## [14.3.0]

- `gather-retrospectives` attributes each report to a project: the main working tree of the Git repository its session ran in, so sibling worktrees count as one project. The collector summary lists reports per project (`byProject`), and `--export` lines carry `project` and `session`. Evidence files written by earlier versions show each working directory as its own project.
- The `gather-retrospectives` summary ranks themes by report count and gives each as a share of its producer's reports, with the number of sessions and, when several projects are mixed, the project it comes from. It names the concrete symptom, reports a proposal only when the cited report states one, moves citations into one source line, and adds the measured effort per producer. Questions the retrospective prompt asks, such as Code Intelligence use, are reported separately by the reasons given, next to the call count from the recorded metrics.

## [14.2.0]

- `gather-retrospectives` carries the task `metrics` that delegated and Reviewer Run reports now record (duration, turns, tool executions and errors, executions per tool name, tokens, cost) into the evidence file and the `--export` lines, together with the run `label`. Older reports have no metrics.
- `/supi-tooling-retro` now asks where the retrospective runs. **Side branch** keeps the previous behavior and is preselected; without dialog support it is used automatically. **Main path** runs it as a normal turn, so the prompt and report stay in context for follow-up prompts. It stores the report the same way but adds no separate report entry. Dismissing the dialog cancels the command.
- `/supi-tooling-retro` now also looks for slow navigation, information the agent could not reach, and instructions that did not change its behavior. Each category is reported only when its trigger occurred in the task. Proposals name a mechanism and prefer a deterministic check or a tool change over new guidance text. Reports from this prompt carry `promptRevision` 2.

## [14.1.0]

- `gather-retrospectives` accepts `--workspace` more than once to collect several directory trees, such as a repository and its sibling Git worktrees, into one snapshot. The combined set has one last-gather marker, regardless of argument order. The skill now checks `git worktree list` before asking for scope and recommends including sibling worktrees when they exist, since delegated and review sessions often run there.
- `gather-retrospectives` also reads the answers under headings that every report shares, such as the Code Intelligence section, which the heading-based grouping skipped.
- The `gather-retrospectives` summary now reports every theme with at least two hits and exact counts, cites reports with a readable session timestamp and line instead of truncated file names, and is written directly in the reply language.

## [14.0.0]

- **Breaking:** `/supi-tooling-retro` is now an extension command instead of a prompt template. With Debug capture enabled and persisted (`persistLevel` at `info` or lower), each normally completed report is stored as a `tooling-retrospective` Debug event, and `gather-retrospectives` collects it as a third source, `--source supi-debug`; the default still gathers all sources. Aborted, failed, or truncated reports are not stored. Without active persistence the command still runs and says the report is not stored. If the agent is busy, the command waits until it is idle. The retrospective now runs on a side branch: afterwards the session returns to where it was, the report stays visible as a display-only entry, and the next prompt continues without the retrospective in the agent's context; use `/tree` to revisit the side branch. Reports written before this release are not collected ([#608](https://github.com/mrclrchtr/supi/issues/608)). Migration: a prompt-template override named `supi-tooling-retro.md` no longer applies, because extension commands take precedence over templates. Rename the override, for example to `my-tooling-retro.md`, and invoke it as `/my-tooling-retro`; its reports are not stored.
- Live `debug` and `/supi-debug` queries keep `info`, `warning`, and `error` events longer. When the retained buffer (`maxEvents`, default 100) is full, the oldest `debug` event is dropped first, and higher-level events keep at most half of the buffer. Before, a few tool calls produced enough per-request LSP timings to push out a summary such as `workspace-symbol.warm-pass` within seconds; it was then only readable from the session file.
- One high-volume category no longer pushes every other category out of the live buffer. Eviction now drops the oldest event of the most frequent source and category, so rare `debug` events such as `workspace-symbol.warm-probe` stay retained next to the newest `request.timing` events. Session file persistence is unchanged ([#619](https://github.com/mrclrchtr/supi/issues/619)).
- The `gather-retrospectives` skill is now user-invoked only (`/skill:gather-retrospectives`); the agent no longer loads it on its own, because it reads many past sessions.

## [13.0.0]

- New `session-analytics` skill, invoked with `/skill:session-analytics`: exports tool calls (with failure-pattern filtering and the agent's next calls), per-session tool availability, or debug-event sizes from past sessions as JSONL for scripted aggregation, replacing ad-hoc grep pipelines over session storage ([#601](https://github.com/mrclrchtr/supi/issues/601)).
- **Breaking:** Absorbs the former `@mrclrchtr/supi-cache` package: `/supi-cache-history`, `/supi-cache-forensics`, the `cache_forensics` tool, and the **Cache Forensics** settings now ship with SuPi Debug. Migration: run `pi remove npm:@mrclrchtr/supi-cache` and install `@mrclrchtr/supi-debug`; the `cache` config section is unchanged. While `@mrclrchtr/supi-cache` is still declared in user or trusted project settings, SuPi Debug shows one warning per Pi process with the exact `pi remove` command, adding `--local` for project declarations ([#596](https://github.com/mrclrchtr/supi/issues/596)).
- Session files now persist only Debug events at `info` level or above by default. Per-file Tree-sitter timings, per-request LSP timings, and other `debug`-level telemetry stay in the live buffer, which cuts session file growth sharply ([#591](https://github.com/mrclrchtr/supi/issues/591)). Set the new `persistLevel` setting to `debug` to keep persisting them. Rare LSP recovery, runtime recovery/retirement transitions, and Structural Worker restart events now use `info` or `warning`, so they are still persisted.
- `gather-retrospectives` adds `--read <evidence> --export <file.jsonl>`, which writes every selected report in full, one per line, so large snapshots can be analyzed in a script instead of paged through 16 KB displays.
- The skill adds a theme-finding step: extract headings, define themes, count them with the Jev classifier, and recheck low-confidence hits.
- Collector output adds `scope.recordSkipReason`, which explains why no last-gather marker was recorded. `--since` without an earlier marker reports `since-without-previous-gather`.
- New opt-in `tui_render` tool: it renders a tool result from the current session branch as the TUI shows it, so an agent can check rendering changes itself. It works for any tool, collapsed or expanded, as plain text, raw ANSI, or theme-token markers such as `[success]3[/success]`. Enable **TUI Render Tool** (`tuiRenderTool`) in the **Debug** settings ([#604](https://github.com/mrclrchtr/supi/issues/604)). In the transcript, a collapsed `tui_render` call shows a one-line summary and a preview of the rendered result lines. For a tool that ran only inside another tool, such as a `codemode` script, it names the parent row to render instead.
- Truncated `cache_forensics` reports are now written to one private per-user directory, `$TMPDIR/supi-<uid>/`, instead of a new `supi-*` directory per call. Identical content reuses one file. SuPi never deletes these files; the OS temp purge does ([#597](https://github.com/mrclrchtr/supi/issues/597)).

## [12.0.0]

- **Breaking:** `debug` rejects unknown parameters instead of ignoring them, and `limit` must be at least 1.
- The `level` and `operationId` schemas no longer send a stray `~optional` keyword to the provider.
- Codemode now lists the `debug` tool under a `debug` namespace heading, so scripts can find them with `describeNamespace("debug")` or `searchTools(query, { namespace: "debug" })`. It is annotated read-only ([#582](https://github.com/mrclrchtr/supi/issues/582)).

## [11.4.0]

- With Debug capture enabled, each session start, reload, resume, or fork records a `runtime-provenance` event with the package version and, when SuPi runs from its own Git checkout, the commit, commit time, and whether tracked files had uncommitted changes.
- The `gather-retrospectives` skill accepts `--since-commit <rev>` to keep only reports from sessions that ran that commit or newer; reports without provenance are excluded and counted. Reports also show the retrospective `promptRevision` and, when recorded, the session's commit and dirty state.
- The `gather-retrospectives` skill now asks for the workspace, time range, and source before collecting when the request leaves the scope open.
- `gather-retrospectives` remembers when each scope was last gathered; `--since-last` collects only reports added since then, and `--no-record` leaves that marker unchanged.

## [11.3.0]

- Added package-specific release notes for SuPi Debug event capture and inspection.
