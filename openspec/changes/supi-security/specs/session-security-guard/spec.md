## ADDED Requirements

### Requirement: Session start registration and effective runtime enumeration
The extension SHALL register a `session_start` handler that derives the effective runtime package set through pi's package-resolution API, not by manually parsing settings JSON and not by treating `listConfiguredPackages()` as already deduped effective state.

The session guard is runtime-focused. It SHALL reflect the effective enabled runtime load set and SHALL NOT surface findings for packages outside the effective runtime set.

The guard SHALL:
- construct a shared `SettingsManager`
- construct `DefaultPackageManager` with `cwd`, `getAgentDir()`, and that settings manager
- call `resolve()` to obtain resolved resources with effective project-over-global precedence and per-resource enabled state
- group enabled resolved resources by `metadata.source` and `metadata.scope`
- keep only npm package groups in v1
- skip package groups whose scope is `temporary` in v1
- recover each npm package group's installed path with `getInstalledPath(source, scope)` for cache and rescan work only for `user` and `project` scopes
- scan only resources whose resolved entry is enabled at runtime

#### Scenario: Session starts with effective installed npm packages
- **WHEN** pi emits `session_start` and effective enabled npm package resources exist
- **THEN** the guard SHALL call `resolve()`
- **AND** it SHALL group enabled resolved resources into effective npm package scan units
- **AND** it SHALL check cached audit state for each effective npm package runtime footprint

#### Scenario: Project scope wins over global
- **WHEN** the same package appears in both global and project settings with different filter configurations
- **THEN** `resolve()` SHALL determine the effective runtime resources
- **AND** the guard SHALL scan and cache only the project-effective runtime footprint

#### Scenario: Non-npm packages are skipped in v1
- **WHEN** effective runtime resources originate from a git or local package source
- **THEN** the guard SHALL skip those package groups
- **AND** it SHALL NOT create runtime findings for them in v1

#### Scenario: Temporary package groups are skipped in v1
- **WHEN** effective runtime resources originate from an npm package group whose scope is `temporary`
- **THEN** the guard SHALL skip that package group
- **AND** it SHALL NOT call `getInstalledPath()` for that temporary scope entry

#### Scenario: First run with no effective npm packages
- **WHEN** pi emits `session_start` and no effective enabled npm package groups exist
- **THEN** the guard SHALL ensure the cache file exists or is initialized
- **AND** it SHALL perform no scans
- **AND** it SHALL surface no notifications

### Requirement: Version-aware audit-state cache
The guard SHALL maintain a JSON cache file at `~/.pi/agent/supi-security-cache.json` mapping effective npm package identities to their latest scan state and audit state.

Each cache entry SHALL store:
- package identity
- exact installed version
- scope
- installed path
- effective enabled runtime resource membership
- latest findings
- audit status for the current installed version
- scan timestamp
- acknowledgment timestamp when available

#### Scenario: Cache file missing
- **WHEN** the cache file does not exist
- **THEN** the guard SHALL treat it as empty
- **AND** it SHALL create the file on first successful persistence

#### Scenario: Cache file is corrupt
- **WHEN** the cache file exists but cannot be parsed as JSON
- **THEN** the guard SHALL treat it as empty
- **AND** it SHALL recreate the cache on the next successful persistence
- **AND** it MAY surface a low-severity notification or log entry describing the reset

### Requirement: Staleness and audit-needed detection
The guard SHALL treat an effective installed npm package as stale or needing audit when its current installed state diverges from the cached audit state.

The following conditions SHALL mark a package as stale:
- no cache entry exists
- installed version changed
- installed path changed
- effective enabled runtime resource membership changed
- latest findings changed
- cached scan state is older than the 24-hour TTL

The following conditions SHALL mark a package as needing audit:
- no cache entry exists
- the current installed version has never been acknowledged
- installed version changed
- findings changed materially since the last acknowledged state

#### Scenario: Newly installed package needs audit
- **WHEN** an npm package appears in the effective runtime set with no cache entry
- **THEN** the guard SHALL scan it
- **AND** it SHALL mark the package as pending audit
- **AND** it SHALL surface an audit-needed notification

#### Scenario: Installed version changes inside the TTL window
- **WHEN** the installed version changes but the previous cache entry is younger than 24 hours
- **THEN** the guard SHALL still treat the entry as stale immediately
- **AND** it SHALL re-scan the new installed version
- **AND** it SHALL mark the new version as pending audit

#### Scenario: Effective runtime resource membership changes
- **WHEN** `resolve()` produces a different enabled runtime resource set for the same npm package identity
- **THEN** the guard SHALL treat the cache entry as stale even if the TTL has not expired

#### Scenario: Findings change for the same installed version
- **WHEN** a background re-scan produces materially different findings for the same installed version
- **THEN** the guard SHALL update the cached findings
- **AND** it SHALL mark the package as pending audit again

#### Scenario: Unchanged acknowledged package stays silent
- **WHEN** the installed version, installed path, effective runtime resource membership, and findings match the cached acknowledged state
- **THEN** the guard SHALL update timestamps as needed without surfacing a notification

### Requirement: Background scan execution
Background scans SHALL be non-blocking and SHALL use rate-limiting to avoid hammering the npm registry.

Within one process, the guard SHALL avoid duplicate overlapping scan loops triggered by repeated `session_start` events or `/reload`.
Session-start notifications SHALL use `warning` severity as an attention signal even when the underlying scan report for a package contains `error`-level findings.

#### Scenario: Multiple packages need scanning
- **WHEN** three npm packages have stale or missing audit-state entries
- **THEN** the guard SHALL scan them sequentially
- **AND** it SHALL wait 750 ms between package scans

#### Scenario: Repeated session starts do not duplicate scans
- **WHEN** a second `session_start` occurs while a background scan loop is already in progress in the same process
- **THEN** the guard SHALL reuse, skip, or short-circuit behind the existing in-flight scan work
- **AND** it SHALL NOT start a second overlapping scan loop

#### Scenario: Scan finds a package needing audit
- **WHEN** a background scan detects that an effective installed npm package is new, changed, or has materially different findings
- **THEN** the guard SHALL surface an audit-needed notification via `ctx.ui.notify()` with severity `warning`

#### Scenario: Multiple packages needing audit are summarized
- **WHEN** several packages need audit during the same background scan pass
- **THEN** the guard SHALL prefer a summary notification over one notification per package
- **AND** the summary SHALL direct the user to `/supi-security-audit-pending`

#### Scenario: Scan finds no meaningful changes
- **WHEN** a background scan produces the same installed version and the same findings as the cached acknowledged state
- **THEN** the guard SHALL update the cache silently without notification

### Requirement: Cache cleanup and concurrency safety
The guard SHALL prune cache entries by comparing against the effective installed npm set derived from `resolve()` plus grouped `metadata.source` and `metadata.scope`. Cache entries whose effective identity no longer matches an effective npm package SHALL be removed.

Cache persistence SHALL tolerate concurrent pi sessions by using atomic write behavior.

When multiple sessions update the same cache file:
- writes for different package identities SHALL preserve both entries
- the newer `scannedAt` timestamp SHALL win for scan results for the same package entry
- the newer acknowledgment timestamp SHALL win for acknowledgment state for the same package entry
- merged writes SHALL preserve newer values field-by-field rather than dropping unrelated updates from another session

#### Scenario: Package uninstalled from project scope only
- **WHEN** a package is removed from `.pi/settings.json` but remains effectively installed from global settings
- **THEN** the guard SHALL keep the cache entry because the package is still effectively installed

#### Scenario: Package uninstalled from all effective npm scopes
- **WHEN** a package no longer appears in the effective npm runtime package set
- **THEN** the guard SHALL remove its cache entry on the next `session_start`

#### Scenario: Disabled package is excluded from the effective runtime set
- **WHEN** a package remains configured but its resources are no longer effectively enabled at runtime
- **THEN** the guard SHALL exclude it from the effective npm runtime package set for scanning purposes
- **AND** it SHALL prune any cache entry whose identity is no longer represented in that effective runtime set

#### Scenario: Two sessions write cache concurrently
- **WHEN** two pi sessions both update the cache around the same time
- **THEN** cache persistence SHALL avoid partial-file corruption
- **AND** each write SHALL be based on the latest on-disk cache state before the atomic replace step

### Requirement: Offline resilience
The guard SHALL handle network failures gracefully during background scans.

#### Scenario: npm registry unreachable
- **WHEN** a background scan fails due to network error
- **THEN** the guard SHALL log or retain the error silently
- **AND** it SHALL keep the previous cache result if one exists
- **AND** it SHALL retry on the next session start
