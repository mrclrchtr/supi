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
