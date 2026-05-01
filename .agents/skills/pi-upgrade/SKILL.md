---
name: pi-upgrade
description: >
  Check for available upgrades to the pi coding agent framework by comparing the
  current @mariozechner/pi-* version in package.json against releases on
  badlogic/pi-mono. Use this skill whenever the user mentions upgrading pi,
  updating the pi framework, checking for new pi versions, migrating pi code,
  or wants to stay current with pi releases. Also use it when reviewing a repo
  that depends on @mariozechner/pi-coding-agent or @mariozechner/pi-tui and
  the user wants to know if they're behind. Triggers on phrases like "upgrade
  pi", "update pi", "pi new version", "pi changelog", "pi migration", or any
  mention of keeping pi dependencies current.
---

# PI Upgrade Advisor

Upgrade pi framework dependencies and discover new features, patterns, and best
practices from the freshly installed release.

## Prerequisites

- GitHub CLI (`gh`) must be installed and authenticated.
- A `package.json` containing `@mariozechner/pi-coding-agent` or
  `@mariozechner/pi-tui` in `dependencies`, `peerDependencies`, or
  `devDependencies`.

## What the script does

The bundled script (`scripts/check-pi-version`) handles all mechanical work:

- Detects the current `@mariozechner/pi-*` version from `package.json`
- Fetches release delta from `badlogic/pi-mono` via `gh`
- Bumps version ranges across **all** workspace `package.json` files
- Runs the detected package manager install (`pnpm`/`npm`/`yarn`/`bun`)
- Returns structured JSON with: current version, latest version, all release
  notes, list of bumped files, install status

**Dry-run is the default recommendation.** The script itself applies changes when
run without `--dry-run`, so ask the user which mode to use before invoking it.
Resolve `scripts/check-pi-version` relative to this `SKILL.md` file's directory;
do not assume the target project contains `.agents/skills/pi-upgrade`.

```bash
# Preview only (recommended/default)
bash "<skill-dir>/scripts/check-pi-version" --dry-run [path/to/package.json]

# Bump + install + report (only after the user chooses direct apply)
bash "<skill-dir>/scripts/check-pi-version" [path/to/package.json]
```

## What YOU (the agent) do

Your job starts **after** the script runs. You do **not** need to:
- Look up versions manually
- Browse GitHub releases
- Summarize changelogs from scratch

The script gives you all of that. Your value-add is:

1. **Analyze the installed docs** — Read `node_modules/@mariozechner/pi-coding-agent/README.md`, `docs/*.md`, and type definitions to find new features, APIs, patterns, and best practices introduced since the old version.
2. **Map findings to the user's codebase** — Look at the project's existing pi extensions, skills, or config. Identify specific files that could benefit from new patterns.
3. **Generate actionable recommendations** — Not just "there's a new feature", but "your extension in `packages/foo/index.ts` could replace its custom X with the new built-in Y available since v0.70.0".

## Workflow

### Step 1: Choose invocation mode

Before running the script, ask the user whether to preview or directly apply:

1. **Dry-run (recommended/default)** — no files change; useful when the user has
   not reviewed the exact package and lockfile changes yet.
2. **Direct apply** — bumps package ranges and installs immediately; useful when
   the user explicitly wants to save a turn/tokens and accepts the file changes.

Do not invoke the script until the user chooses a mode. If the user already gave
an explicit preference in their request, follow it without asking again.

### Step 2: Run the script

Run from the project root. Resolve the helper as `<skill-dir>/scripts/check-pi-version`,
where `<skill-dir>` is the directory containing this `SKILL.md`. Capture the JSON
output. If it returns `upToDate: true`, congratulate the user and stop.

If the script errors, surface the exact error and ask the user to fix it.

### Step 3: Continue based on the selected mode

#### If dry-run was selected

Use the JSON output to summarize the available upgrade, release notes, and files
that would be bumped. Do **not** analyze `node_modules/` as the latest release yet:
dry-run does not install anything, so local docs and type definitions may still be
from the old version.

After the dry-run summary, ask whether the user wants to apply the upgrade. If
they confirm, rerun the script without `--dry-run`, then continue with the
installed-doc analysis below. If they decline, stop after the preview.

#### If direct apply was selected

The script bumps package ranges and runs install immediately. If `installExitCode`
is non-zero, surface `installOutput` and stop; the latest docs may not be present.
If install succeeds, continue with the installed-doc analysis below.

### Step 4: Read the newly installed pi docs

After the script succeeds with `applied: true` and `installExitCode: 0`, the latest
pi docs are now available in `node_modules/`. Read selectively based on what the
release notes indicate changed:

- **New APIs / tools / events?** → Read `README.md` sections and type definitions
- **New config options?** → Read `docs/settings.md`, `docs/extensions.md`
- **Behavior changes?** → Read relevant docs and compare with the project's usage
- **Deprecation notices?** → Find what replaces them in the docs

Focus on things the user's project could actually use. Skip internal build/CI
changes unless they affect the project.

### Step 5: Investigate the user's pi usage

Read the project's pi-relevant files to understand current patterns:

- `package.json` pi manifest (`pi.extensions`, `pi.prompts`, `pi.skills`)
- Extension source files (event handlers, tool registrations, UI components)
- Existing skills and prompts
- Any `CLAUDE.md` or project docs referencing pi APIs

### Step 6: Generate the upgrade report

ALWAYS use this exact template:

```markdown
# PI Upgrade Report

**Current:** `{{current}}` → **Latest:** `{{latest}}`
**Bumped:** {{bumpedFiles.length}} package.json file(s)
**Install:** {{installExitCode == 0 ? "✓ succeeded" : "✗ failed (see output)"}}

## What's new (analyzed from docs)

<!-- For each significant new feature/pattern found in the installed docs -->

### {{Feature name}} (since {{version}})
- **What it does:** ...
- **Where to find it:** `node_modules/@mariozechner/pi-coding-agent/docs/...`
- **Opportunity in your codebase:** {{specific file/line that could benefit}}

## Breaking changes that may affect you

<!-- Only list ones relevant to patterns the project actually uses -->

- **{{Change}}** ({{version}}) — Your `{{file}}` uses `{{oldPattern}}` which {{impact}}.
  **Migration:** ...

## Deprecations with replacements

- `{{oldAPI}}` → `{{newAPI}}` ({{version}})

## Recommended next steps

1. {{Specific action with file path}}
2. {{Another specific action}}
3. ...

## Verification checklist
- [ ] `package.json` ranges updated
- [ ] Lockfile refreshed
- [ ] Type-check passes
- [ ] Tests pass
- [ ] Extension loads without errors (`/reload` in pi)
```

### Step 7: Offer to apply migrations

After presenting the report, ask what the user wants to do:

1. **Apply a specific migration** — Edit the identified files to adopt a new
   pattern or replace deprecated usage.
2. **Create a task list** — Generate `PI_UPGRADE_TODO.md` or GitHub issues for
   incremental work.
3. **Nothing right now** — Keep the report for later reference.

## Guardrails

- **Ask before every first invocation** — dry-run is recommended by default, but
  direct apply is allowed when the user explicitly chooses it to save a turn/tokens.
- **Respect version pinning** — the script preserves `~`/`^`/`>=` prefixes;
  don't change them unless the release notes explicitly recommend it.
- **Handle pre-releases carefully** — if `latest` is a prerelease, note it
  prominently and suggest the latest stable instead unless the user asks.
- **No `gh` CLI?** Ask the user to install it (`brew install gh`) and run
  `gh auth login`.
- **Private forks or mirrors** — if the user tracks pi from a different repo,
  ask for the `owner/repo` string and edit the script's `REPO` variable.
- **Install failed?** Surface the `installOutput` and `installExitCode` from the
  script's JSON. Don't pretend it succeeded.

## Edge cases

- **Monorepo with multiple packages:** The script auto-discovers workspace
  packages. Review all bumped files, not just the root.
- **No newer releases:** The script returns `upToDate: true`. Stop there.
- **Massive delta:** If spanning many releases, focus doc analysis on the most
  recent 3–5 releases. Summarize older ones briefly.
- **Post-install docs not readable:** If `node_modules` isn't present or the
  package structure differs, fall back to reading the release notes from the
  script's JSON output and ask the user about their setup.
