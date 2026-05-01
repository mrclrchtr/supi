# PI Upgrade (Skill)

Check for available upgrades to the pi coding agent framework and generate actionable migration reports. Intended for **extension developers** who build on top of `@mariozechner/pi-coding-agent` or `@mariozechner/pi-tui` and want to keep their projects current with new releases.

## What it does

1. **Detects** the current `@mariozechner/pi-*` version from `package.json` (resolves ranges, lockfiles, and `node_modules`)
2. **Fetches** release delta from `badlogic/pi-mono` via `gh`
3. **Bumps** version ranges across all workspace `package.json` files
4. **Installs** using the detected package manager (`pnpm`/`npm`/`yarn`/`bun`)
5. **Analyzes** newly installed docs & type definitions against the user's codebase
6. **Generates** an upgrade report with new features, breaking changes, deprecations, and recommended next steps

## Trigger phrases

> "upgrade pi", "update pi", "pi new version", "pi changelog", "pi migration", "keep pi dependencies current"

## Prerequisites

- **GitHub CLI** (`gh`) installed and authenticated — the script uses `gh release list` and `gh release view` to fetch releases from `badlogic/pi-mono`
- A **`package.json`** containing `@mariozechner/pi-coding-agent` or `@mariozechner/pi-tui` in `dependencies`, `peerDependencies`, or `devDependencies`
- **Bash ≥ 5.0** for the helper script (uses namerefs, associative arrays, and `${var@Q}`)

## Usage

The skill is invoked automatically by the agent when the user asks about pi upgrades. The agent will:

1. Ask whether to **dry-run** (default, recommended) or **direct apply**
2. Run `scripts/check-pi-version` with the chosen mode
3. Read newly installed pi docs to identify new features, breaking changes, and deprecations
4. Map findings to the user's specific codebase
5. Present a structured upgrade report and offer migrations

### Direct script usage

```bash
# Preview what would change (no files modified)
bash "skills/pi-upgrade/scripts/check-pi-version" --dry-run [path/to/package.json]

# Bump versions, install, and report
bash "skills/pi-upgrade/scripts/check-pi-version" [path/to/package.json]
```

### Script output

The script emits JSON with:

| Field | Description |
|---|---|
| `current` | Detected current version |
| `currentSource` | Where the version was found (`package-range`, `lockfile`, or `node_modules`) |
| `latest` | Latest available release tag |
| `upToDate` | `true` if no newer releases exist |
| `newerReleases` | Array of releases between current and latest, each with `tagName`, `name`, `body`, `publishedAt` |
| `bumpedFiles` | List of `package.json` files that were (or would be) changed |
| `bumpChanges` | Per-file detail: field, package, old value, new value |
| `updatePackages` | `@mariozechner/pi-*` packages targeted for update |
| `installCommand` | The package manager command that was (or would be) run |
| `installExitCode` | Exit code of the install step (0 on success) |
| `installOutput` | Stdout+stderr from install |

## File structure

```
pi-upgrade/
├── SKILL.md                  # Agent-facing skill instructions
├── README.md                  # This file
├── .claude-plugin/
│   └── plugin.json            # Plugin manifest
└── scripts/
    └── check-pi-version       # Version detection, bump & install helper
```

## Notes

- **Monorepo aware** — auto-discovers workspace packages and bumps all of them
- **Respects version pinning** — preserves `~`, `^`, `>=` prefixes; `peerDependencies` for pi packages are set to `*`
- **Pre-release safe** — if the latest release is a pre-release, the agent will flag it and suggest the latest stable instead
- **Idempotent** — safe to re-run; no-op if already up to date