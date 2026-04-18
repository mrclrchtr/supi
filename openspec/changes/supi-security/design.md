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
