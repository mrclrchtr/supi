# Changelog

## [11.4.0]

- With Debug capture enabled, each session start, reload, resume, or fork records a `runtime-provenance` event with the package version and, when SuPi runs from its own Git checkout, the commit, commit time, and whether tracked files had uncommitted changes.
- The `gather-retrospectives` skill accepts `--since-commit <rev>` to keep only reports from sessions that ran that commit or newer; reports without provenance are excluded and counted. Reports also show the retrospective `promptRevision` and, when recorded, the session's commit and dirty state.
- The `gather-retrospectives` skill now asks for the workspace, time range, and source before collecting when the request leaves the scope open.
- `gather-retrospectives` remembers when each scope was last gathered; `--since-last` collects only reports added since then, and `--no-record` leaves that marker unchanged.

## [11.3.0]

- Added package-specific release notes for SuPi Debug event capture and inspection.
