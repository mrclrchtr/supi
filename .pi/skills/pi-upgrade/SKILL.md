---
name: pi-upgrade
description: >
  Check for available upgrades to the pi coding agent framework by comparing the
  current `@earendil-works/pi-*` or legacy `@mariozechner/pi-*` version in
  package.json against releases on `earendil-works/pi`. Use this skill whenever
  the user asks to upgrade pi, update pi, check pi changelogs/releases, or
  migrate off the deprecated `@mariozechner/*` packages.
metadata:
  internal: true
disable-model-invocation: true
---

# Pi Upgrade Advisor

Upgrade pi framework dependencies, migrate legacy package names, and surface the
new patterns available in the latest release.

## Prerequisites

- GitHub CLI (`gh`) must be installed and authenticated.
- A `package.json` containing either `@earendil-works/pi-coding-agent` or
  `@earendil-works/pi-tui` (legacy `@mariozechner/*` names also work).

## What the script does

The bundled helper (`scripts/check-pi-version`) handles the mechanical work:

- Detects the current pi package version from `package.json`, lockfiles, or
  `node_modules`
- Fetches release delta from `earendil-works/pi` via `gh`
- Updates version ranges across workspace `package.json` files
- Updates existing Pi overrides in `pnpm-workspace.yaml`, including `@earendil-works/chord`
- Keeps Pi peer dependencies at `*` and preserves manifest range prefixes
- Migrates `@mariozechner/pi-*` entries to `@earendil-works/pi-*`
- Runs the detected package manager install
- Returns structured JSON with the current version, latest version, release
  notes, bumped files, and install status

The helper updates files and installs immediately. Run it for upgrade requests
without a separate confirmation.
A request to edit this skill or its helper is not approval to upgrade Pi.

Resolve `scripts/check-pi-version` relative to this `SKILL.md` file's directory;
do not assume the target project contains `.pi/skills/pi-upgrade`.

```bash
# Update versions, install, and report
bash "<skill-dir>/scripts/check-pi-version" [path/to/package.json]
```

## What YOU do after the helper runs

1. **Analyze the installed docs** — Read the installed `pi-coding-agent` README,
   `docs/*.md`, and type definitions for new features, APIs, patterns, and
   deprecations.
2. **Map findings to the user's codebase** — Look at the repo's existing pi
   extensions, skills, or config and point to specific files that could benefit.
3. **Generate actionable recommendations** — Explain what changed, what broke,
   what was renamed, and what the user should do next.

## Workflow

### Step 1: Run the helper

Run from the project root. Resolve the helper as `<skill-dir>/scripts/check-pi-version`,
where `<skill-dir>` is the directory containing this `SKILL.md`.

If it returns `upToDate: true`, congratulate the user and stop.

If it errors, surface the exact error and ask the user to fix it.

### Step 2: Check the install result

The helper bumps package ranges and runs install immediately. If `installExitCode`
is non-zero, surface `installOutput` and stop; the latest docs may not be present.
Continue only when install and resolved-version checks succeed. Check
`resolvedVersions` before reading the new docs.

### Step 3: Read the newly installed pi docs

After the helper succeeds with `applied: true` and `installExitCode: 0`, the
resolved versions must match the target release in `resolvedVersions`.
Only then read the docs in `node_modules/`.

- Prefer `node_modules/@earendil-works/pi-coding-agent/README.md` and `docs/*.md`
- If the project is still on the deprecated scope during an in-progress migration,
  read the matching installed path for whatever scope is actually present
- Focus on new APIs, config options, deprecations, and behavior changes that
  matter to the user's code

### Step 4: Investigate the user's pi usage

Read the project's pi-relevant files to understand current patterns:

- `package.json` pi manifest (`pi.extensions`, `pi.prompts`, `pi.skills`)
- Extension source files (event handlers, tool registrations, UI components)
- Existing skills and prompts
- Any `CLAUDE.md` or project docs referencing pi APIs

### Step 5: Generate the upgrade report

Use the helper output and the repo context to write a report that includes:

- What changed in pi
- Which files in the repo are affected
- Any breaking changes or deprecations
- Concrete follow-up steps

### Step 6: Offer to apply migrations

After presenting the report, ask what the user wants to do next:

1. Apply a specific migration
2. Create a task list
3. Leave it for later

## Guardrails

- Run upgrade requests without a separate confirmation.
- Respect version pinning; keep `^`/`~` prefixes unless the upgrade requires it.
- Handle pre-releases carefully.
- If `gh` is missing, ask the user to install and authenticate it.
- For private forks/mirrors, ask for the repo override before editing the helper.
- If install fails, surface `installOutput` and `installExitCode`.

## Workspace overrides

The helper updates existing direct `@earendil-works/pi-*`, legacy
`@mariozechner/pi-*`, and `@earendil-works/chord` overrides together. It does not
add overrides. Use a block mapping with scalar versions in `pnpm-workspace.yaml`.
Pi selectors and alias values need manual review; the helper stops before edits
when it finds them. Other YAML settings and comments stay unchanged.

The helper includes override changes in `bumpChanges`. It sets these overrides
to the target release, then installs and checks installed Pi dependencies.
A successful install alone does not prove that old pins were removed. A version
mismatch returns a non-zero exit code and includes the error in `installOutput`.
Failed apply can leave changed files; review them before you retry.
