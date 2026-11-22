# Pi Upgrade (Skill)

Check for available upgrades to the pi coding agent framework and generate actionable migration reports. Intended for **extension developers** who build on top of `@earendil-works/pi-coding-agent` or `@earendil-works/pi-tui` (and legacy `@mariozechner/*` installs) and want to keep their projects current with new releases.

## What it does

1. **Detects** the current `@earendil-works/pi-*` or legacy `@mariozechner/pi-*` version from `package.json` (resolves ranges, lockfiles, and `node_modules`)
2. **Fetches** release delta from `earendil-works/pi` via `gh`
3. **Bumps** version ranges across workspace `package.json` files
4. **Migrates** legacy `@mariozechner/pi-*` package names to `@earendil-works/pi-*`
5. **Installs** using the detected package manager (`pnpm`/`npm`/`yarn`/`bun`)
6. **Analyzes** newly installed docs and type definitions against the user's codebase
7. **Generates** an upgrade report with new features, breaking changes, deprecations, and recommended next steps

## Prerequisites

- **GitHub CLI** (`gh`) installed and authenticated — the helper uses `gh release list` and `gh release view` to fetch releases from `earendil-works/pi`
- A **`package.json`** containing `@earendil-works/pi-coding-agent` or `@earendil-works/pi-tui` (legacy `@mariozechner/*` names are also accepted)

## Usage

1. Run the helper to update files and install, without asking for confirmation
2. Read the installed docs if the upgrade applied cleanly
3. Map the release notes to the repo's actual pi usage
4. Present a structured upgrade report and offer follow-up migrations

```bash
# Update versions, migrate legacy names, install, and report
bash "<skill-dir>/scripts/check-pi-version" [path/to/package.json]
```

## Package mapping

| Old package | New package |
| --- | --- |
| `@mariozechner/pi-coding-agent` | `@earendil-works/pi-coding-agent` |
| `@mariozechner/pi-agent-core` | `@earendil-works/pi-agent-core` |
| `@mariozechner/pi-ai` | `@earendil-works/pi-ai` |
| `@mariozechner/pi-tui` | `@earendil-works/pi-tui` |
| `@mariozechner/pi-web-ui` | `@earendil-works/pi-web-ui` |

`0.73.1` was the final release on the old scope. Starting with `0.74.0`, releases ship under `@earendil-works`.

## Script output

| Field | Description |
|---|---|
| `current` | Detected current version |
| `currentSource` | Where the version was found (`workspace-override`, `package-range`, `lockfile`, or `node_modules`) |
| `depName` | Detected package name |
| `depField` | Dependency field containing the package |
| `depRange` | Original version range from `package.json` |
| `latest` | Latest available release tag |
| `upToDate` | `true` if no newer releases exist |
| `newerReleases` | Releases between current and latest, with `tagName`, `name`, `body`, `publishedAt` |
| `bumpedFiles` | Manifest and workspace override files changed by the helper |
| `bumpChanges` | Per-file changes with `field`, `package`, optional `packageFrom`, `old`, and `new` |
| `updatePackages` | Canonical pi packages detected in the workspace |
| `installCommand` | The package manager command that was run |
| `installExitCode` | Non-zero if install, dedupe, or version verification fails |
| `resolvedVersions` | Installed Pi versions checked after install |
| `installOutput` | Stdout+stderr from install |

## File structure

```
pi-upgrade/
├── SKILL.md                  # Agent-facing skill instructions
├── README.md                 # This file
├── .claude-plugin/
│   └── plugin.json            # Plugin manifest
└── scripts/
    └── check-pi-version       # Version detection, bump & install helper
```

## Notes

- **Monorepo aware** — auto-discovers workspace packages and bumps all of them
- **Legacy migration aware** — automatically rewrites `@mariozechner/pi-*` entries to `@earendil-works/pi-*`
- **Respects version pinning** — preserves `~`, `^`, `>=` prefixes; `peerDependencies` for pi packages are set to `*`
- **Idempotent** — safe to re-run; no-op if already up to date

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
