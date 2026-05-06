## Why

PI extensions run with full system authority by default. Installing or updating a malicious or compromised extension means arbitrary code execution on the user's machine. In practice, users will keep reaching for the natural built-in flows: `pi install` and `pi update`.

That makes a separate "secure installer" command the wrong abstraction for v1. Even if SuPi added alternate commands, users could still mutate packages through the built-in pi workflow, and the current extension API does not expose a documented pre-install or pre-update hook for mediating those built-in package operations before activation.

This change therefore pivots from "secure install surface" to "package change detection and audit." `supi-security` will detect npm packages that were newly installed, changed version, or have never been audited, then surface a scan report and audit-needed state on session start and through explicit audit commands.

## What Changes

- Add new workspace package `packages/supi-security/` as an installable pi extension
- Add `/supi-security-audit <source>` to audit a single effective installed npm package
- Add `/supi-security-audit-pending` to audit effective installed npm packages that are new, changed, or still pending audit
- Integrate `npq` for npm package health scanning using the exact installed package version discovered from the installed package root
- Add a custom pi capability scanner that audits installed npm package contents via the `pi` key in `package.json` first, falls back to conventional directories, resolves bundled dependencies, honors pi filter semantics including `!`, `+path`, and `-path`, and reports active versus inactive findings
- Add a session guard that uses `DefaultPackageManager.resolve()` on `session_start` to derive the effective enabled runtime resource set, detect new or changed npm packages, re-scan stale entries, and surface audit-needed notifications via `ctx.ui.notify()`
- Store extension-managed audit state in `~/.pi/agent/supi-security-cache.json` with atomic persistence and stale-entry pruning
- Add `@mrclrchtr/supi-security` as a dependency of the `supi` meta-package and add a `packages/supi/security.ts` wrapper entry so published `@mrclrchtr/supi` installs expose the extension
- **No breaking changes** to existing packages

## Capabilities

### New Capabilities

- `package-security-audit`: Manual audit of effective installed npm packages via `npq` and custom pi capability analysis
- `session-security-guard`: Background detection and re-scanning of effective installed npm packages on session start with cached audit state and notification surfacing

### Modified Capabilities

- (none)

## Impact

- **New package**: `packages/supi-security/` (~1200-2000 LOC including tests and UI)
- **Workspace wiring**: new package `tsconfig`, test `tsconfig`, root `typecheck` / `typecheck:tests` updates, and `vitest.workspace.ts` entry
- **Meta-package update**: `packages/supi/package.json` adds `@mrclrchtr/supi-security` dependency and `packages/supi/security.ts` is added to `pi.extensions`
- **Root local-dev update**: root `package.json` `pi.extensions` adds the new extension path for workspace testing
- **External requirement**: `npq` CLI must be installed separately (detected at runtime; hint shown if missing)
- **Deliberate v1 scope cut**: scans and audit commands support effective installed npm packages only; git and local-path packages are explicitly out of scope for this version
- **Advisory, not preventative**: v1 audits package changes after they enter pi's effective package set; it does not block built-in `pi install` or `pi update`
- **Future extensibility**: pre-install or pre-update enforcement would require pi core hooks outside the scope of this SuPi-only change
- **No runtime enforcement**: this is a scanning and audit layer, not a sandbox. Existing security extensions remain the runtime containment solution.
## Context

PI extensions execute arbitrary code with full system authority. The built-in `pi install` and `pi update` commands mutate settings and package contents directly, and users are likely to keep using those natural commands rather than separate wrapper commands.

Pi does expose the APIs needed to observe the effective runtime package set after those mutations. Public exports include `DefaultPackageManager`, `SettingsManager`, and `getAgentDir()` from `@mariozechner/pi-coding-agent`. `DefaultPackageManager.resolve()` returns the effective enabled runtime resources after project-over-global precedence and per-resource enabled state are applied. `getInstalledPath(source, scope)` can recover the installed package root for an effective package group. Package discovery and filter semantics are documented in `docs/packages.md`, including the `pi` key in `package.json`, conventional directories, `!` exclusions, and exact-path `+path` / `-path` filters.

The SuPi ecosystem already provides the meta-package wrapper pattern needed for published installs: `packages/supi` exposes local `.ts` wrapper entrypoints such as `aliases.ts`, `ask-user.ts`, and `lsp.ts`, then registers those wrappers in its own `pi.extensions` array. `supi-security` needs the same treatment or published `@mrclrchtr/supi` installs will not load it.

## Goals / Non-Goals

**Goals:**

- Support the natural pi workflow by auditing packages installed or updated through normal `pi install` / `pi update` usage
- Provide `/supi-security-audit <source>` to audit one effective installed npm package
- Provide `/supi-security-audit-pending` to audit effective installed npm packages that are new, changed, or pending audit
- Derive the effective runtime package set through `DefaultPackageManager.resolve()`, not by manually parsing settings JSON
- Show npm package health signals via `npq`, while clearly degrading when `npq` is missing or its output cannot be parsed
- Show pi-specific capability analysis across installed npm package resources discovered via the `pi` key in `package.json` first, with conventional-directory fallback
- Distinguish findings from currently enabled runtime resources versus inactive or not-currently-enabled resources within the same installed package
- Persist audit state keyed by effective package identity, installed version, scope, installed path, and effective runtime membership
- Surface audit-needed state automatically on `session_start` without agent or LLM involvement

**Non-Goals:**

- Replacing `pi install` or `pi update` with alternate secure mutation commands in v1
- Pre-install or pre-update enforcement before built-in pi package activation
- Git-source or local-path review in v1
- Runtime policy enforcement or sandboxing
- Transitive dependency CVE scanning via `npm audit` in v1
- Static analysis with AST or data-flow tracking
- Hard-blocking packages automatically; all audit output remains advisory

## Decisions

### 1. Center the feature on ambient package audit, not replacement install commands

**Rationale:** Users will naturally continue to use `pi install` and `pi update`. A separate `/supi-install` or `/supi-update` surface would not cover the primary path unless users deliberately changed behavior. The current pi extension surface does not document a hook for intercepting the built-in package mutation lifecycle before activation.

v1 SHALL therefore:

- keep the built-in pi package workflow untouched
- detect npm package changes after they enter the effective runtime set
- surface audit-needed state automatically on `session_start`
- provide manual audit commands for explicit package inspection

v1 SHALL NOT claim to pre-approve or block built-in `pi install` or `pi update`.

**Alternative considered:** Wrapper install/update commands. Rejected because they would not mediate the natural built-in workflow and would overstate protection.

### 2. Manual audit surfaces are `/supi-security-audit` and `/supi-security-audit-pending`

**Rationale:** The extension still needs explicit user-facing audit entrypoints, but they should operate on the installed package set rather than on candidate package sources.

v1 SHALL add:

- `/supi-security-audit <source>` to audit one effective installed npm package
- `/supi-security-audit-pending` to audit all effective installed npm packages whose current state is new, changed, stale, or pending audit

The commands are audit-only. They do not mutate package settings or package contents.

`/supi-security-audit <source>` SHALL accept npm package sources or package names that resolve to an effective installed npm package identity. If no matching effective npm package is found, the command SHALL fail with a clear error.

`/supi-security-audit-pending` SHALL operate on the effective installed npm package set and SHALL focus only on packages whose current cached audit state indicates user attention is needed.

**Alternative considered:** No manual commands, session guard only. Rejected because users need an explicit way to inspect or re-check one package on demand.

### 3. Effective runtime scope is derived from `resolve()`

**Rationale:** `DefaultPackageManager.listConfiguredPackages()` is not sufficient for runtime review because it simply lists configured entries. Pi's actual precedence and enabled-state logic are applied during `resolve()`.

The session guard and audit commands SHALL therefore:

1. Instantiate `DefaultPackageManager` with a shared `SettingsManager`
2. Call `packageManager.resolve()` to obtain the effective runtime resource set with dedupe and enabled state already applied
3. Group resolved resources by `metadata.source` and `metadata.scope`
4. Keep only npm package groups in v1
5. Skip package groups whose scope is `temporary` in v1
6. Recover installed paths with `packageManager.getInstalledPath(source, scope)` only for `user` and `project` package groups

This keeps audit behavior aligned with what pi will actually load.

Before implementation logic depends on specific `resolve()` fields, v1 work SHALL verify the pinned `@mariozechner/pi-coding-agent` version's resolved-resource shape for the fields used by this change, especially enabled state plus `metadata.source` and `metadata.scope`.

**Alternative considered:** Reconstruct effective state from settings JSON. Rejected because it would duplicate pi logic and drift from actual runtime behavior.

### 4. Capability scanning operates on installed package contents, not temporary candidate tarballs

**Rationale:** Once the feature pivots to ambient review of installed packages, the correct filesystem to inspect is the installed package root, not a temporary extraction of a candidate tarball.

Resource discovery SHALL follow pi's package rules against the installed package root:

1. Read the `pi` key in `package.json` when present
2. Resolve manifest paths, globs, `!` exclusions, and bundled-dependency paths such as `node_modules/<pkg>/extensions`
3. Fall back to conventional directories only when no `pi` manifest is present
4. Apply pi filter semantics for the active runtime bucket, including `!`, `+path`, and `-path`
5. Keep inactive findings visible in the audit report rather than silently omitting them

Discovered bundled-dependency resources are scanned with the same extension, skill, and prompt rules as first-party package resources.

**Concrete cross-reference rules for v1:**

Single signals produce findings, but these combinations escalate severity to an `error` or high-risk signal:

- **Network + filesystem** -> package can exfiltrate local files
- **Network + environment access** -> package can exfiltrate tokens or secrets
- **Network + subprocess execution** -> package can download and execute remote code
- **Tool interception or tool-result modification + custom tool registration or built-in tool override** -> package can reshape agent behavior dynamically
- **Prompt override or credential-access instructions** -> high risk on their own

The following combinations escalate to at least `warning` even if the individual findings are otherwise low-confidence:

- **Executable skill instructions + custom commands or tools**
- **Skill shell-instruction patterns + bash override**

False positives inside comments or strings are acceptable in v1. The scanner remains best effort.
Report wording SHOULD therefore present regex-derived findings as pattern matches or possible capabilities rather than as proof of intent.

**Alternative considered:** Scope scanning to extension files only. Rejected because pi skills and prompts can still materially change agent behavior.

### 5. `npq` is used against the exact installed npm version and invoked directly

**Rationale:** The audit feature should report npm health for the package version that is actually installed. `npq` is a standalone CLI, not an `npm` subcommand.

v1 SHALL resolve and invoke `npq` directly from `PATH`. `npmCommand` from pi settings SHALL NOT be prepended to `npq` execution.

The npm health pipeline is:

1. Read the installed package's `package.json`
2. Determine the exact installed package name and version
3. Run `npq <name>@<version> --plain`
4. Parse package blocks and summary totals into structured findings
5. If parsing fails, mark the npm-health section as `unparsed` and show raw `npq` stdout in the report

v1 does not enforce a hard minimum `npq` version. Instead, the parser will be snapshot-tested against observed `--plain` outputs and will fall back visibly when parsing fails.

Because this is a post-install audit, `npq` is treated as a metadata and health signal rather than as a preventative guard. The installed-package capability scan remains the primary audit mechanism.

**Alternative considered:** Port `npq` internals to TypeScript. Rejected due to maintenance burden.

### 6. Audit state is version-aware and tied to the installed artifact

**Rationale:** Audit state must invalidate when package code changes, not just when the package identity exists.

The cache file lives at:

```txt
~/.pi/agent/supi-security-cache.json
```

Each npm cache entry SHALL include at least:

- package identity
- exact installed version
- scope
- installed path
- effective enabled runtime resource membership
- latest scan findings
- audit status (`pending` or `acknowledged`)
- `acknowledgedAt`
- `scannedAt`

An entry SHALL be considered stale when any of the following change:

- no cache entry exists
- installed version changes
- installed path changes
- effective enabled runtime resource membership changes
- findings change
- the entry is older than the 24-hour TTL

This closes the gap where a package could change within the TTL window but keep the same enabled resource set.

**Alternative considered:** Identity plus TTL only. Rejected because it misses version changes inside the TTL window.

### 7. Session guard scans in the background and surfaces audit-needed state

**Rationale:** The session guard should support the natural pi workflow without blocking startup.

On `session_start`, the guard SHALL:

1. Enumerate effective npm package groups via `resolve()`
2. Compare the current package state against cached audit state
3. Re-scan stale or changed packages sequentially, with a 750 ms delay between packages
4. Mark packages as `pending` audit when they are new, changed, unacknowledged, or have materially changed findings
5. Surface notifications only when user attention is needed

The guard SHALL be runtime-focused:

- it SHALL scan only effective enabled runtime resources
- it SHALL not surface findings for packages that are not in the effective runtime set
- it SHALL skip non-npm packages in v1
- it SHALL skip `temporary` package groups in v1
- it SHALL prevent duplicate concurrent scan loops within one process, for example by reusing or short-circuiting behind a single in-flight scan promise

Session-start notifications are attention signals, not full reports. v1 SHALL therefore keep audit-needed notifications at `warning` severity even when the underlying scan report contains `error`-level findings. The detailed report shown by manual audit commands or TUI flows may still classify findings as `info`, `warning`, or `error`.

**Alternative considered:** Block startup until all changed packages are audited. Rejected because the extension layer cannot honestly guarantee pre-activation enforcement and should not simulate it.

### 8. Audit UX uses rich TUI when available and explicit acknowledgment in interactive mode

**Rationale:** Users need a visible way to inspect findings and acknowledge an audited package version.

Behavior matrix:

- **Rich UI available:** use `ctx.ui.custom()` for a full report with an explicit `Acknowledge audit` action
- **Interactive but no custom UI:** print plain-text findings and use `ctx.ui.confirm()` to acknowledge the audit
- **Headless mode (`ctx.hasUI === false`):** print the report and do not acknowledge the package automatically

This keeps audit state explicit rather than inferring it from mere command execution.

**Alternative considered:** Automatically acknowledge a package whenever a command prints findings. Rejected because that would make audit state too easy to clear accidentally.

### 9. Cache writes use atomic persistence plus merge-before-write

**Rationale:** Users may run multiple pi sessions at once. The cache strategy must avoid truncated JSON and avoid discarding another session's newer audit state.

v1 cache persistence SHALL:

- write updates to a temporary file in the same directory
- rename atomically into place
- re-read and merge the latest on-disk cache before persisting
- serialize writes within a process through a small queue

Merge semantics SHALL be entry-local:

- writes for different package identities SHALL preserve both entries
- when two sessions update the same package entry, the newer `scannedAt` timestamp SHALL win for scan results
- the newer `acknowledgedAt` timestamp SHALL win for acknowledgment state
- if one write updates findings and another updates acknowledgment for the same package entry, the merged entry SHALL preserve the newer value for each field independently

### 10. Scanner fidelity against pi internals is snapshot-tested

**Rationale:** The capability scanner intentionally mirrors pi's manifest and filter behavior closely enough to distinguish active versus inactive findings, but that creates drift risk when pi changes its internal resource-discovery logic.

v1 SHALL include fixture or snapshot tests against a small corpus of real pi package layouts, including bundled dependencies and exact-path filters. These tests SHALL be treated as upgrade guards when the pinned pi version changes.
These fixture-driven tests depend on real sample packages or captured package layouts and may be scheduled late in the implementation sequence once the scanner is otherwise stable.

**Alternative considered:** Best-effort overwrite only. Rejected because it is too easy to lose audit state under concurrent sessions.

## Risks / Trade-offs

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Users assume v1 blocks `pi install` or `pi update` | Medium | High | State clearly that v1 is advisory post-change audit |
| `npq` changes `--plain` output format | Medium | High | Snapshot-test observed outputs; show raw stdout when parsing fails |
| Settings fail to load or package-manager state cannot be derived | Medium | Medium | Use `SettingsManager`, drain errors, and show clear configuration guidance |
| Sophisticated obfuscation evades regex scanner | Low | Low | Document the scanner as best effort |
| `npq` not installed | Medium | Medium | Detect at runtime, show install hint, continue with capability scan only |
| Concurrent sessions race on cache file | Medium | Medium | Atomic temp-file writes plus merge-before-write |
| Scanner drifts from pi resource discovery | Medium | High | Snapshot-test real package layouts and revisit if pi exposes a first-class discovery API |
| Users want pre-install enforcement for the built-in pi workflow | High | Medium | Defer to a future pi core hook design rather than overpromising in SuPi |
| Git or local package users want coverage immediately | Medium | Low | Skip explicitly in v1 and treat as a follow-up change |

## Migration Plan

1. Develop `packages/supi-security/` as a standalone package
2. Add local-development wiring in the workspace (`tsconfig`, test config, root `pi.extensions`, root scripts, `vitest.workspace.ts`)
3. Add `@mrclrchtr/supi-security` to `packages/supi/package.json`
4. Add `packages/supi/security.ts` and register it in the meta-package `pi.extensions`
5. Run `pnpm verify` (typecheck, biome, tests)
6. Install or update a real npm package with built-in pi commands, then verify `session_start`, `/supi-security-audit`, and `/supi-security-audit-pending`
7. Commit and push; no production migration needed (new package)

## Open Questions

None for v1. The scope questions are resolved as follows:

- published `@mrclrchtr/supi` installs require a local meta-package wrapper entry
- v1 supports effective installed npm packages only
- the runtime guard uses `resolve()` instead of `listConfiguredPackages()`
- audit state is version-aware and tied to the installed artifact
- pre-install or pre-update enforcement requires pi core hooks outside this change
## 1. Package Scaffold & Workspace Wiring

- [ ] 1.1 Create `packages/supi-security/` with `package.json`, `index.ts`, `README.md`, `CLAUDE.md`, `.gitignore`, and `tsconfig.json`
- [ ] 1.2 Create `packages/supi-security/__tests__/tsconfig.json` for test-only typechecking
- [ ] 1.3 Add the package `pi` manifest in `packages/supi-security/package.json` pointing to the extension entrypoint
- [ ] 1.4 Set `peerDependencies` for `@mariozechner/pi-coding-agent` and `@mariozechner/pi-tui`; add `@sinclair/typebox` only if runtime imports actually require it
- [ ] 1.5 Add `@mrclrchtr/supi-security` to `packages/supi/package.json` dependencies
- [ ] 1.6 Add `packages/supi/security.ts` as a local wrapper re-export for the published meta-package and register it in `packages/supi/package.json` `pi.extensions`
- [ ] 1.7 Add `packages/supi-security/index.ts` to the root `package.json` `pi.extensions` array for local workspace development
- [ ] 1.8 Add `packages/supi-security/tsconfig.json` to the root `typecheck` script and `packages/supi-security/__tests__/tsconfig.json` to the root `typecheck:tests` script
- [ ] 1.9 Add `packages/supi-security` to `vitest.workspace.ts`

## 2. Shared pi Integration Helpers

- [ ] 2.1 Implement a helper that creates shared pi integration state: `agentDir = getAgentDir()`, `settingsManager = SettingsManager.create(ctx.cwd, agentDir)`, and `packageManager = new DefaultPackageManager({ cwd: ctx.cwd, agentDir, settingsManager })`
- [ ] 2.2 Implement helper(s) to drain or report settings I/O errors when relevant
- [ ] 2.3 Verify the pinned `@mariozechner/pi-coding-agent` version's `resolve()` result shape for the fields used here, especially enabled state plus `metadata.source` and `metadata.scope`
- [ ] 2.4 Write tests for effective package resolution through `resolve()`

## 3. Effective Installed Package Discovery

- [ ] 3.1 Implement effective npm package enumeration via `packageManager.resolve()`, grouping enabled resolved resources by `metadata.source` and `metadata.scope`
- [ ] 3.2 Recover installed paths for effective npm package groups via `packageManager.getInstalledPath(source, scope)` while skipping `temporary` scope groups
- [ ] 3.3 Implement exact installed version detection from the installed package root
- [ ] 3.4 Implement source matching for `/supi-security-audit <source>` using npm package identity, effective package source, and installed package name
- [ ] 3.5 Write tests for project-wins dedupe, effective enabled resource grouping, missing installed path handling, and package lookup failures

## 4. npq Integration

- [ ] 4.1 Implement `detectNpq(): boolean` that checks whether `npq` is available in `PATH`
- [ ] 4.2 Implement `runNpqScan(spec: string): Promise<NpqResult>` that shells out to `npq <name>@<version> --plain`
- [ ] 4.3 Implement parser for `npq --plain` output (package issues plus summary totals)
- [ ] 4.4 Define fallback UX for unparseable `npq` output by preserving raw stdout in the report
- [ ] 4.5 Write parser tests against multiple captured `--plain` output variants
- [ ] 4.6 Implement missing-`npq` behavior: show install hint and continue with capability scan only
- [ ] 4.7 Ensure `npq` is resolved and invoked directly from `PATH`, not through pi's `npmCommand` wrapper

## 5. Installed Package Capability Scanner

- [ ] 5.1 Define `CapabilityPattern` types and the initial regex pattern set for tool interception, tool overrides, network, subprocess, filesystem, environment access, skill shell instructions, and prompt override signals
- [ ] 5.2 Implement resource discovery from the installed package root using the `pi` key in `package.json`, manifest globs, `!` exclusions, bundled dependency paths, and conventional-directory fallback
- [ ] 5.3 Implement pi filter handling for the active runtime bucket, including `!`, `+path`, and `-path`, while preserving inactive findings in the report
- [ ] 5.4 Implement `scanCapabilities(resources: PackageResources): CapabilityReport` for extensions, skills, and prompts, preserving active and inactive finding state
- [ ] 5.5 Implement cross-reference escalation rules:
  - network + filesystem => high risk
  - network + env => high risk
  - network + subprocess => high risk
  - tool interception or tool-result modification + custom tool registration or tool override => high risk
  - executable skill instructions + custom commands or tools => escalated warning
- [ ] 5.6 Write tests for representative extension, skill, and prompt samples
- [ ] 5.7 Add edge-case tests for comments or strings, minified code, bundled dependency resources, exact-path `+path` and `-path` filters, and skill-only or prompt-only packages
- [ ] 5.8 Add fixture or snapshot tests against a few real pi package layouts to detect drift from pi resource-discovery semantics across pi version bumps
  Requires real sample packages or captured package layouts; schedule late if needed.

## 6. Audit Report & Acknowledgment UX

- [ ] 6.1 Define `ScanReport` and `AuditState` types combining `npq` results, capability findings, parse-fallback state, active vs inactive finding buckets, audit status, and cross-reference severity
- [ ] 6.2 Implement report building and severity classification (`info`, `warning`, `error`), while labeling regex-derived findings as pattern matches or possible capabilities where appropriate
- [ ] 6.3 Implement a rich TUI overlay using `ctx.ui.custom()` and `@mariozechner/pi-tui`
- [ ] 6.4 Implement interactive plain-text fallback using `ctx.ui.confirm()`
- [ ] 6.5 Implement headless-mode output behavior (`ctx.hasUI === false`): print the report without acknowledging the package automatically
- [ ] 6.6 Implement explicit acknowledgment behavior that marks the current package version as acknowledged only after user confirmation
- [ ] 6.7 Write tests for report rendering, inactive finding sections, acknowledgment behavior, and headless fallback decisions

## 7. Manual Audit Commands

- [ ] 7.1 Register `pi.registerCommand('supi-security-audit', ...)`
- [ ] 7.2 Register `pi.registerCommand('supi-security-audit-pending', ...)`
- [ ] 7.3 Implement `/supi-security-audit <source>` validation for missing source, unknown package, and non-npm effective package targets
- [ ] 7.4 Implement `/supi-security-audit <source>` flow: resolve effective package -> recover installed path and version -> run scans -> build report -> gather acknowledgment -> persist audit state
- [ ] 7.5 Implement `/supi-security-audit-pending` flow over effective npm packages whose audit state is pending, stale, changed, or missing
- [ ] 7.6 Implement no-op behavior for `/supi-security-audit-pending` when there are no packages needing audit
- [ ] 7.7 Run manual-only end-to-end verification with a real npm package installed or updated through built-in `pi install` or `pi update`

## 8. Session Guard & Audit-State Cache

- [ ] 8.1 Implement cache read and write for `join(getAgentDir(), 'supi-security-cache.json')`
- [ ] 8.2 Implement audit-state entries keyed by package identity, installed version, scope, installed path, and effective enabled runtime resource membership
- [ ] 8.3 Implement staleness rules for: missing entry, version change, installed path change, runtime membership change, findings change, and 24-hour TTL expiry
- [ ] 8.4 Implement corrupt-cache recovery (treat as empty, recreate on successful write)
- [ ] 8.5 Implement atomic cache persistence with merge-before-write to tolerate concurrent sessions
- [ ] 8.6 Define and implement entry-level merge semantics for concurrent writes, including timestamp-based conflict resolution for findings and acknowledgments
- [ ] 8.7 Implement `session_start` handler that detects effective npm package changes, scans stale packages, and marks changed packages as pending audit
- [ ] 8.8 Implement duplicate-scan protection so repeated `session_start` events or `/reload` do not start overlapping scan loops in one process
- [ ] 8.9 Implement sequential background scan scheduling with a 750 ms delay between packages
- [ ] 8.10 Implement summary-first audit-needed notifications for newly installed, version-changed, or materially changed npm packages
- [ ] 8.11 Implement cache pruning against the effective installed npm package set plus effective enabled runtime scan scope
- [ ] 8.12 Write unit tests for cache logic, version-change invalidation inside the TTL window, corrupt-cache recovery, concurrent-write merge behavior, and pruning decisions
- [ ] 8.13 Write integration-style tests for project-wins dedupe through `resolve()`, temporary-scope skipping, duplicate-scan suppression, summary notifications, first run with no effective npm packages, non-npm package skipping, disabled-package pruning, offline resilience, bundled dependency rescans, skill-only package rescans, prompt-only package rescans, and unchanged acknowledged packages staying silent

## 9. Integration & Verification

- [ ] 9.1 Run `pnpm exec biome check --write packages/supi-security packages/supi-security/__tests__`
- [ ] 9.2 Run `pnpm typecheck` and fix any type errors
- [ ] 9.3 Run `pnpm typecheck:tests` and fix any test-only type errors
- [ ] 9.4 Run `pnpm test` and ensure all tests pass
- [ ] 9.5 Run `pnpm pack:check` to verify the meta-package still packs correctly
- [ ] 9.6 Update `packages/supi/CLAUDE.md` with `supi-security` package guidance
- [ ] 9.7 Update the repo root `CLAUDE.md` workspace package list with `supi-security`

## 10. Documentation

- [ ] 10.1 Write `packages/supi-security/README.md` with `pi install` / `pi update` compatibility, `/supi-security-audit`, `/supi-security-audit-pending`, npm-only scope, and advisory limitations
- [ ] 10.2 Write `packages/supi-security/CLAUDE.md` with architecture, concrete pi API usage (`DefaultPackageManager`, `SettingsManager`, `getAgentDir()`, `resolve()`), npm-only v1 scope, and audit-state cache strategy
- [ ] 10.3 Document the external `npq` dependency, parser fallback behavior, and the fact that v1 does not preempt built-in pi package activation
## ADDED Requirements

### Requirement: Manual package audit commands
The extension SHALL register manual audit commands through `pi.registerCommand()`.

The documented command surface for v1 is:

```text
/supi-security-audit <source>
/supi-security-audit-pending
```

#### Scenario: Single-package audit command is available
- **WHEN** the user types `/supi-security-audit npm:@foo/bar`
- **THEN** the command handler executes and begins the audit pipeline for the matching effective installed npm package

#### Scenario: Audit-pending command is available
- **WHEN** the user types `/supi-security-audit-pending`
- **THEN** the command handler executes and begins auditing effective installed npm packages whose current audit state requires user attention

#### Scenario: Source argument is missing
- **WHEN** the user runs `/supi-security-audit` with no source argument
- **THEN** the command SHALL abort without scanning
- **AND** it SHALL print a usage message showing `/supi-security-audit <source>`

#### Scenario: No packages need audit
- **WHEN** the user runs `/supi-security-audit-pending` and no effective installed npm packages are new, changed, stale, or pending audit
- **THEN** the command SHALL exit without scanning additional packages
- **AND** it SHALL show a clear message explaining that nothing currently requires audit

### Requirement: npm-only effective package audit support
The audit commands SHALL support only effective installed npm packages in v1.

#### Scenario: npm package source is accepted
- **WHEN** the requested audit target resolves to an effective installed npm package
- **THEN** the command SHALL treat it as a supported audit target

#### Scenario: Unknown package is rejected
- **WHEN** the requested source or package name does not match any effective installed npm package
- **THEN** the command SHALL abort before scanning
- **AND** it SHALL show a clear error explaining that no matching effective installed npm package was found

#### Scenario: Non-npm effective package is rejected
- **WHEN** the requested audit target resolves to a git or local effective package source
- **THEN** the command SHALL abort before scanning
- **AND** it SHALL show a clear error explaining that only npm packages are supported in v1

### Requirement: Shared pi API integration for audit targeting
The audit commands SHALL use pi's public package-management APIs by constructing a shared `SettingsManager` and `DefaultPackageManager` with `getAgentDir()`, and by deriving effective package targets from `resolve()`.

#### Scenario: Effective package resolution uses `resolve()`
- **WHEN** an audit command needs to determine which package to scan
- **THEN** it SHALL call `new DefaultPackageManager({ cwd, agentDir: getAgentDir(), settingsManager })`
- **AND** it SHALL invoke `resolve()` to determine the effective runtime package set

#### Scenario: Installed path is recovered from package manager
- **WHEN** an audit command identifies an effective installed npm package target
- **THEN** it SHALL call `getInstalledPath(source, scope)` for that package group
- **AND** it SHALL use the installed package root for scanning and version detection

#### Scenario: Temporary package scope is skipped
- **WHEN** an effective npm package group has `scope === "temporary"`
- **THEN** the audit pipeline SHALL skip that package group in v1
- **AND** it SHALL NOT call `getInstalledPath()` for that temporary scope entry

#### Scenario: `npq` is invoked directly
- **WHEN** the audit pipeline needs to run `npq <name>@<version> --plain`
- **THEN** it SHALL resolve and invoke `npq` directly from `PATH`
- **AND** it SHALL NOT prepend pi's configured `npmCommand` wrapper to the `npq` invocation

### Requirement: npq health scan for the installed version
For npm audit targets, the scanner SHALL determine the exact installed package version from the installed package root, shell out to `npq <name>@<version> --plain`, and capture per-package errors, warnings, and summary totals.

#### Scenario: Installed version is used
- **WHEN** the audit target is `npm:@foo/bar`
- **THEN** the scanner SHALL determine the exact installed version before running `npq`
- **AND** it SHALL audit that exact installed version rather than a floating npm tag

#### Scenario: npq detects warnings
- **WHEN** `npq` returns warnings for the installed package version
- **THEN** the scanner SHALL record each warning with its category and message

#### Scenario: npq detects errors
- **WHEN** `npq` returns errors for the installed package version
- **THEN** the scanner SHALL record each error with its category and message

#### Scenario: npq summary totals are parsed
- **WHEN** `npq` prints the summary section
- **THEN** the scanner SHALL record the total package, error, and warning counts from that output

#### Scenario: npq is not installed
- **WHEN** the `npq` executable is not found in `PATH`
- **THEN** the scanner SHALL show a clear hint with install instructions
- **AND** it SHALL skip the `npq` scan while continuing the pi capability scan

#### Scenario: npq output cannot be parsed
- **WHEN** `npq --plain` returns output that does not match the expected parser rules
- **THEN** the scanner SHALL mark the npm-health section as unparsed
- **AND** it SHALL include raw `npq` stdout in the report instead of silently omitting npm-health results

### Requirement: Installed package capability scan
The scanner SHALL perform a full installed-package audit by discovering and scanning package resources for known pi API patterns and instruction-level risk signals, and by reporting findings split into code capabilities and instruction-level risks.

If the effective installed package has discovered resources that are not currently active at runtime, the report SHALL distinguish:
- findings from currently enabled effective runtime resources
- findings from inactive or not-currently-enabled package resources

Inactive resources SHALL remain visible in the report rather than being silently omitted.

Resource discovery SHALL follow pi's package rules in order:
1. Read the `pi` key in the installed package's `package.json`.
2. If a `pi` manifest is present, resolve `extensions`, `skills`, `prompts`, and `themes` paths, globs, and exclusions from that manifest, including paths into bundled dependencies such as `node_modules/other-pkg/extensions`.
3. If no `pi` manifest is present, fall back to conventional directories: `extensions/` (`.ts`, `.js`), `skills/` (`SKILL.md` and root `.md` files), `prompts/` (`.md` files), and `themes/` (`.json` files).
4. Apply effective runtime filter semantics for the active bucket, including `!`, `+path`, `-path`, and resource enable or disable state, without omitting inactive resources from the audit.

#### Scenario: Detect tool interception in extensions
- **WHEN** an extension source file contains `pi.on("tool_call"`
- **THEN** the scanner SHALL report `Intercepts tool calls` under code capabilities

#### Scenario: Detect tool result modification in extensions
- **WHEN** an extension source file contains `pi.on("tool_result"`
- **THEN** the scanner SHALL report `Modifies tool results` under code capabilities

#### Scenario: Detect bash override in extensions
- **WHEN** an extension source file contains `createBashTool(`
- **THEN** the scanner SHALL report `Overrides bash tool` under code capabilities

#### Scenario: Detect read/write/edit override in extensions
- **WHEN** an extension source file contains `createReadTool(`, `createWriteTool(`, or `createEditTool(`
- **THEN** the scanner SHALL report the specific override(s) under code capabilities

#### Scenario: Detect custom tools in extensions
- **WHEN** an extension source file contains `pi.registerTool(`
- **THEN** the scanner SHALL report the count of custom tools registered under code capabilities

#### Scenario: Detect custom commands in extensions
- **WHEN** an extension source file contains `pi.registerCommand(`
- **THEN** the scanner SHALL report the count of custom commands registered under code capabilities

#### Scenario: Detect network access in extensions
- **WHEN** an extension source file contains `import.*node:http`, `import.*node:https`, `import.*node:net`, or `fetch(`
- **THEN** the scanner SHALL report `Network access detected` under code capabilities

#### Scenario: Detect subprocess execution in extensions
- **WHEN** an extension source file contains `import.*node:child_process`, `spawn(`, or `exec(`
- **THEN** the scanner SHALL report `Subprocess execution detected` under code capabilities

#### Scenario: Detect filesystem access in extensions
- **WHEN** an extension source file contains `import.*node:fs` or `readFileSync(`
- **THEN** the scanner SHALL report `Filesystem access detected` under code capabilities

#### Scenario: Detect environment access in extensions
- **WHEN** an extension source file contains `process\\.env`
- **THEN** the scanner SHALL report `Environment variable access detected` under code capabilities

#### Scenario: Detect executable instructions in skills
- **WHEN** a discovered skill markdown file contains patterns like `bash`, `npm install`, `curl | bash`, or executable code blocks
- **THEN** the scanner SHALL report `Skill contains executable instructions` under instruction-level risks

#### Scenario: Detect system prompt injection in prompts
- **WHEN** a discovered prompt template contains instructions that override safety guidelines or request credential access
- **THEN** the scanner SHALL report `Prompt may contain override instructions` under instruction-level risks

#### Scenario: Manifest-declared resources are discovered
- **WHEN** a package's `package.json` contains `"pi": { "extensions": ["./custom-exts"] }`
- **THEN** the scanner SHALL discover resources from `./custom-exts/`
- **AND** it SHALL NOT rely solely on conventional `extensions/` directory discovery

#### Scenario: Bundled dependency paths are resolved and scanned
- **WHEN** a package's `pi` manifest includes `"node_modules/other-pkg/extensions"`
- **THEN** the scanner SHALL resolve that bundled dependency path from the installed package contents
- **AND** it SHALL scan the discovered extension files with the same capability rules used for first-party package extensions

#### Scenario: Exact-path filter include is honored for active findings
- **WHEN** the effective package filter contains `"+extensions/safe.ts"`
- **THEN** the scanner SHALL include `extensions/safe.ts` in the active runtime bucket when computing active findings
- **AND** it SHALL still report other discovered resources outside the active bucket as inactive when applicable

#### Scenario: Exact-path filter exclude is honored for active findings
- **WHEN** the effective package filter contains `"-extensions/legacy.ts"`
- **THEN** the scanner SHALL exclude `extensions/legacy.ts` from the active runtime bucket
- **AND** it SHALL still scan `extensions/legacy.ts` for audit visibility and report any findings as inactive

#### Scenario: Package with only skills does not appear fully clean
- **WHEN** a package has no discovered extension files but has discovered skill files with executable instructions
- **THEN** the scanner SHALL still report findings under instruction-level risks
- **AND** it SHALL NOT report a clean overall result

### Requirement: Cross-reference risk escalation
The scanner SHALL apply concrete cross-reference rules to elevate severity when combinations of capabilities imply materially higher risk.

Regex-derived findings are heuristic. The report SHALL present them as pattern matches or possible capabilities unless a stronger signal is available.

#### Scenario: Network plus filesystem escalates severity
- **WHEN** the scanner finds both network access and filesystem access in scanned package resources
- **THEN** it SHALL add a high-risk finding explaining that the package can exfiltrate local files

#### Scenario: Network plus environment access escalates severity
- **WHEN** the scanner finds both network access and environment-variable access
- **THEN** it SHALL add a high-risk finding explaining that the package can exfiltrate secrets or tokens

#### Scenario: Network plus subprocess execution escalates severity
- **WHEN** the scanner finds both network access and subprocess execution
- **THEN** it SHALL add a high-risk finding explaining that the package can download and execute remote code

#### Scenario: Tool interception plus tool modification escalates severity
- **WHEN** the scanner finds tool interception or tool-result modification together with custom tool registration or built-in tool override
- **THEN** it SHALL add a high-risk finding explaining that the package can reshape agent behavior dynamically

#### Scenario: Prompt override instructions are high risk on their own
- **WHEN** the scanner finds prompt instructions that override safety boundaries or request credential access
- **THEN** it SHALL add a high-risk finding even without any additional cross-reference combination

### Requirement: Report presentation and audit acknowledgment
The scanner SHALL present findings in a rich TUI overlay when `ctx.ui.custom()` is available, or use plain-text fallback otherwise.

When inactive or not-currently-enabled resources produce findings, the report SHALL show them separately from currently enabled effective runtime findings.

Audit status for the currently installed package version SHALL be updated to `acknowledged` only after explicit user acknowledgment in interactive mode.
The report may classify findings as `info`, `warning`, or `error`.

#### Scenario: Rich TUI available
- **WHEN** `ctx.ui.custom()` is defined and returns a promise
- **THEN** the scanner SHALL render a full-screen overlay with categorized findings and an explicit action to acknowledge the package audit

#### Scenario: Inactive findings are shown separately
- **WHEN** the audit finds issues in resources that are discovered but not currently enabled
- **THEN** the report SHALL place those issues in a distinct inactive or not-currently-enabled section
- **AND** it SHALL NOT merge them into the currently enabled effective runtime summary

#### Scenario: Interactive plain-text fallback
- **WHEN** `ctx.ui.custom()` is unavailable but interactive UI is still available
- **THEN** the scanner SHALL print plain-text findings and prompt with `ctx.ui.confirm()` before acknowledging the package audit

#### Scenario: Headless mode prints report only
- **WHEN** `ctx.hasUI === false`
- **THEN** the scanner SHALL print the report in plain text
- **AND** it SHALL NOT attempt to call interactive dialog methods
- **AND** it SHALL NOT acknowledge the package audit automatically
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
