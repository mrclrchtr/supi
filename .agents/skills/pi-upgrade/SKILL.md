---
name: pi-upgrade
description: >
  Check for available upgrades to the pi coding agent framework by comparing the
  current `@earendil-works/pi-*` or legacy `@mariozechner/pi-*` version in
  package.json against releases on `earendil-works/pi`. Use this skill whenever
  the user asks to upgrade pi, update pi, check pi changelogs/releases, or
  migrate off the deprecated `@mariozechner/*` packages.
---

# PI Upgrade Advisor

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
- Bumps version ranges across workspace `package.json` files
- Migrates `@mariozechner/pi-*` entries to `@earendil-works/pi-*`
- Runs the detected package manager install
- Returns structured JSON with the current version, latest version, release
  notes, bumped files, and install status

**Dry-run is the default recommendation.** The helper applies changes when run
without `--dry-run`, so ask the user which mode to use before invoking it.

Resolve `scripts/check-pi-version` relative to this `SKILL.md` file's directory;
do not assume the target project contains `.agents/skills/pi-upgrade`.

```bash
# Preview only (recommended/default)
bash "<skill-dir>/scripts/check-pi-version" --dry-run [path/to/package.json]

# Bump + install + report (only after the user chooses direct apply)
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

### Step 1: Choose invocation mode

Before running the helper, ask the user whether to preview or directly apply:

1. **Dry-run (recommended/default)** — no files change.
2. **Direct apply** — bumps package ranges and installs immediately.

Do not invoke the helper until the user chooses a mode. If they already stated a
preference, follow it without asking again.

### Step 2: Run the helper

Run from the project root. Resolve the helper as `<skill-dir>/scripts/check-pi-version`,
where `<skill-dir>` is the directory containing this `SKILL.md`.

If it returns `upToDate: true`, congratulate the user and stop.

If it errors, surface the exact error and ask the user to fix it.

### Step 3: Continue based on the selected mode

#### If dry-run was selected

Use the JSON output to summarize the available upgrade, release notes, and files
that would be bumped. Do **not** analyze `node_modules/` as the latest release yet:
dry-run does not install anything, so local docs and type definitions may still be
from the old version.

After the preview, ask whether the user wants to apply the upgrade. If they
confirm, rerun the helper without `--dry-run`, then continue with the installed-doc
analysis below. If they decline, stop after the preview.

#### If direct apply was selected

The helper bumps package ranges and runs install immediately. If `installExitCode`
is non-zero, surface `installOutput` and stop; the latest docs may not be present.
If install succeeds, continue with the installed-doc analysis below.

### Step 4: Read the newly installed pi docs

After the helper succeeds with `applied: true` and `installExitCode: 0`, the
latest pi docs are available in `node_modules/`.

- Prefer `node_modules/@earendil-works/pi-coding-agent/README.md` and `docs/*.md`
- If the project is still on the deprecated scope during an in-progress migration,
  read the matching installed path for whatever scope is actually present
- Focus on new APIs, config options, deprecations, and behavior changes that
  matter to the user's code

### Step 5: Investigate the user's pi usage

Read the project's pi-relevant files to understand current patterns:

- `package.json` pi manifest (`pi.extensions`, `pi.prompts`, `pi.skills`)
- Extension source files (event handlers, tool registrations, UI components)
- Existing skills and prompts
- Any `CLAUDE.md` or project docs referencing pi APIs

### Step 6: Generate the upgrade report

Use the helper output and the repo context to write a report that includes:

- What changed in pi
- Which files in the repo are affected
- Any breaking changes or deprecations
- Concrete follow-up steps

### Step 7: Offer to apply migrations

After presenting the report, ask what the user wants to do next:

1. Apply a specific migration
2. Create a task list
3. Leave it for later

## Guardrails

- Ask before the first invocation.
- Respect version pinning; keep `^`/`~` prefixes unless the upgrade requires it.
- Handle pre-releases carefully.
- If `gh` is missing, ask the user to install and authenticate it.
- For private forks/mirrors, ask for the repo override before editing the helper.
- If install fails, surface `installOutput` and `installExitCode`.
