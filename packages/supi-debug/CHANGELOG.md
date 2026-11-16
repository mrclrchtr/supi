# Changelog

## [13.0.0]

- New `session-analytics` skill: exports tool calls (with failure-pattern filtering and the agent's next calls), per-session tool availability, or debug-event sizes from past sessions as JSONL for scripted aggregation, replacing ad-hoc grep pipelines over session storage ([#601](https://github.com/mrclrchtr/supi/issues/601)).
- **Breaking:** Absorbs the former `@mrclrchtr/supi-cache` package: `/supi-cache-history`, `/supi-cache-forensics`, the `cache_forensics` tool, and the **Cache Forensics** settings now ship with SuPi Debug. Migration: run `pi remove npm:@mrclrchtr/supi-cache` and install `@mrclrchtr/supi-debug`; the `cache` config section is unchanged.
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
