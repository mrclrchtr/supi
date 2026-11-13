# Changelog

## [12.1.0]

- `gather-retrospectives` adds `--read <evidence> --export <file.jsonl>`, which writes every selected report in full, one per line, so large snapshots can be analyzed in a script instead of paged through 16 KB displays.
- The skill adds a theme-finding step: extract headings, define themes, count them with the Jev classifier, and recheck low-confidence hits.
- Collector output adds `scope.recordSkipReason`, which explains why no last-gather marker was recorded. `--since` without an earlier marker reports `since-without-previous-gather`.

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
