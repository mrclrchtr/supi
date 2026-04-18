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
