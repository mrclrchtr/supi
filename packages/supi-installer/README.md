# @mrclrchtr/supi-installer

Select direct SuPi package declarations in Project and Global scopes. This is a standalone Node CLI, not a PI extension.

## Start

1. Install [PI](https://pi.dev) and its required Node runtime. Make sure `pi` is on `PATH`.
2. Open PI in the target project directory. Use `/trust` to save approval for that directory or an ancestor.
3. Run the installer in a terminal:

```sh
npx @mrclrchtr/supi-installer@latest
```

To select another exact project directory:

```sh
npx @mrclrchtr/supi-installer@latest --project /path/to/project
```

The installer does not find a Git root, install PI, or grant project trust. Without saved project approval, it exits even for global-only changes. `PI_CODING_AGENT_DIR` selects a different PI agent directory when set.

## Installation Matrix

```text
Package                         Project   Global
supi-code-intelligence           [ ]       [x]
supi-web                         [x]       [ ]
```

- A checkbox represents a direct declaration in that scope, not effective capability availability.
- Project uses `<project>/.pi/settings.json`. Global uses PI's agent settings.
- The matrix starts from current declarations, not a preset.
- Clearing Project does not disable a global declaration. Filters and bundled extensions can also affect which capabilities load.
- Existing pins and resource filters remain unchanged unless their declaration is removed.
- New declarations use unpinned official npm sources. Use PI for later updates.

| Key | Action |
| --- | --- |
| Up / Down | Select a package |
| Left / Right | Select Project or Global |
| Space | Change the focused checkbox |
| `r` | Replace the focused column with Recommended |
| `a` | Replace the focused column with All current packages |
| `c` | Clear editable declarations in the focused column |
| Enter | Review exact scoped changes |
| `y` in review | Confirm and apply |
| `e` in review | Return to editing |
| Escape / Ctrl-C | Cancel |

Use a terminal with at least 60 columns and 12 rows. Rows and the review scroll. Bracketed paste cannot edit or confirm a draft.

Recommended contains the eight release-stack packages. All also includes beta packages, DevTools, Consulting, and Prompt Improver. Presets replace the draft for one column only; review can therefore include removals.

## Removal and failures

- Normal removal uses `pi remove` in the selected scope. It does not purge SuPi configuration, credentials, sessions, reports, or local checkouts.
- Known obsolete standalone declarations have removal-only cells. They cannot be added to a new scope.
- Recognized Git/local SuPi installations and legacy root installations block their scope. Remove the conflicting source with PI before using the matrix. The installer does not migrate it.
- Unknown and unrelated declarations remain unmanaged and unchanged.
- Settings and trust are checked again before and between commands. An observed external edit stops new commands and requires a new review.
- Additions run before removals. A failed command does not stop independent changes, including a removal in the other scope of the same row.
- **A failed destination install can still be followed by source removal, leaving neither declaration.** There is no automatic rollback.
- Cancellation stops new commands and stops the active child where possible. The final report lists successes, failures, unattempted operations, and observed declarations.

Run `/reload` or restart PI after package changes.

## Read-only inventory

```sh
npx @mrclrchtr/supi-installer@latest --dry-run
```

This prints current declarations and scope restrictions without a terminal or package changes. It still requires PI and saved project trust. It is not a scripted target selection or an update/repair command.

Use `--help` or `--version` without a trust requirement. Unattended package changes are not supported.

## Development

```sh
node packages/supi-installer/bin/supi-installer.mjs --help
pnpm vitest run packages/supi-installer/ --reporter=agent
node node_modules/@typescript/native/bin/tsc -b packages/supi-installer/tsconfig.json packages/supi-installer/__tests__/tsconfig.json
```

The CLI uses checked JavaScript and has no build step. Tests use temporary settings, trust stores, and a fake PI executable. See the [installer contract](../../docs/conventions/installer.md) for the full design and verification requirements.
