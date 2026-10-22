# SuPi installer design

Status: implemented. See the [CLI README](../../packages/supi-installer/README.md) for commands and controls.

## Boundary

- Provide a separate Node CLI, not a PI extension or a runtime meta-package.
- Manage direct package declarations through PI package commands.
- Do not manage effective resource activation, standalone skills, or user-data cleanup.
- Use the terms [Installation Matrix and Installation Preset](../../GLOSSARY.md).
- Keep declarations separate from activation; see [ADR 0025](../adr/0025-installation-matrix-declarations.md).

## Distribution

| Item | Contract |
| --- | --- |
| npm package | `@mrclrchtr/supi-installer` |
| Recommended invocation | `npx @mrclrchtr/supi-installer@latest` |
| Binary | `supi-installer` |
| Systems | macOS, Linux, Windows |
| Runtime | Node compatible with PI's documented requirement; no Bash dependency |
| Host | Require `pi` on `PATH`; show setup instructions and exit if absent |
| Package role | CLI-only; no `pi.extensions` entry |

- Do not install or upgrade PI.
- The CLI replaces the retired `scripts/install.sh`, `scripts/install-all.sh`, and `scripts/uninstall.sh` commands.
- Update installation documentation to use the CLI. Do not retain compatibility wrappers or a second installer implementation.
- Add the CLI to the normal publish and unified-release process when implemented.

## Invocation

| Input | Behavior |
| --- | --- |
| No options | Open the interactive matrix after preflight checks |
| `--project <path>` | Use this directory for Project instead of the current directory |
| `--dry-run` | Print current declarations and scope restrictions; do not prompt or change packages |
| `--help` | Show usage without requiring project trust |
| `--version` | Show the CLI version without requiring project trust |

- Normal interactive use requires a terminal. Without one, exit with instructions.
- `--dry-run` can run without a terminal. It reports the current inventory, not a new scripted target selection.
- The first version has no unattended install, remove, or preset-apply arguments.
- Use the exact project directory, not an inferred Git root. Show its absolute path and the settings paths.
- Warn if the selected project directory is the user's home directory.
- Global settings use PI's agent directory, including `PI_CODING_AGENT_DIR` when set.
- Project settings use `<project>/.pi/settings.json`.

## Preflight and project trust

- Require a saved PI trust approval for the canonical project directory or an ancestor.
- Use the nearest saved decision. A nearer denial overrides an ancestor approval.
- No saved approval means exit before opening the matrix, even for global-only work.
- Apply the same trust requirement to `--dry-run`.
- Show instructions to open PI in the chosen directory, use `/trust`, and rerun the installer.
- Do not pass `--approve`, prompt for new trust, or change PI's trust store.
- Do not treat `defaultProjectTrust: "always"` as a saved approval.
- Read settings and trust data without executing project code. Do not start an agent session to inspect them.
- Invalid or unreadable state must produce an error before package changes. Do not treat a read failure as an empty installation.
- Let PI enforce its own trust checks when package commands run. Report a later rejection as an operation failure.

## Installation Matrix

```text
Package                 Project   Global
Code Intelligence         [ ]      [x]
Web                       [x]      [ ]
Ask User                  [x]      [x]
```

- One row represents one user-facing Extension Package.
- Each cell represents a direct declaration in its own scope.
- A checked cell does not prove that its resources load or its package files are present.
- Initialize cells from existing declarations. Do not apply a startup preset, including on a fresh installation.
- Both cells can be checked. PI normally gives the project declaration precedence in that project.
- A clear Project cell does not disable a global declaration. Show global availability separately from the checkbox.
- A clear cell does not prove that related behavior is absent. For example, Prompt Improver also exposes Ask User.
- Preserve resource filters, including project filtering deltas. The matrix does not interpret a filtered entry as absent.
- Show short package descriptions and applicable audience, maturity, and opt-in labels. Labels must agree with package documentation.

### Controls

| Control | Behavior |
| --- | --- |
| Up / Down | Select a package row |
| Left / Right | Select Project or Global |
| Space | Change the focused editable cell |
| Enter | Open the change review |
| Escape | Cancel the draft without package commands |

- Provide Recommended, All, and Clear actions for the focused column.
- Support scrolling and a terminal size that cannot show all package rows at once.
- Restore terminal state on normal exit, error, and cancellation.

## Catalog and presets

- Ship package names, descriptions, labels, and preset membership with the CLI release.
- Do not fetch a live catalog, repository script, or remote command definition at startup.
- `npx` can download the CLI before it starts. Package downloads after confirmation remain PI's responsibility.
- Use one installer-owned catalog. Check its current-package coverage against workspace extension manifests.
- New package choices require a CLI release; document `@latest` as the normal invocation.

### Current package coverage

Use the `@mrclrchtr/` namespace for each package below.

| Package | Recommended |
| --- | --- |
| `supi-agent` | No |
| `supi-ask-user` | Yes |
| `supi-bash-timeout` | No |
| `supi-cache` | No |
| `supi-claude-md` | No |
| `supi-code-intelligence` | Yes |
| `supi-consulting` | No |
| `supi-context` | Yes |
| `supi-debug` | No |
| `supi-extras` | Yes |
| `supi-insights` | No |
| `supi-prompt-improver` | No |
| `supi-prompt-suggestions` | Yes |
| `supi-review` | No |
| `supi-settings` | Yes |
| `supi-skills` | Yes |
| `supi-web` | Yes |

Infrastructure Packages are not new-install choices.

### Preset behavior

| Action | Draft target in the focused column |
| --- | --- |
| Recommended | Exactly the eight Recommended packages above |
| All | All current user-facing Extension Packages, including Consulting and Prompt Improver |
| Clear | No editable package declarations |

- Replace the focused column's draft; do not change the other column.
- Presets do not run package commands.
- Preset targets contain current packages only. Replacement can propose removal of extra or obsolete managed declarations.
- Leave unmanaged declarations and blocked scopes unchanged.
- All means all current user-facing Extension Packages. Do not retain the old full-stack script's exclusions.

## Existing sources and obsolete declarations

| Source or declaration | Treatment |
| --- | --- |
| Current official npm Extension Package | Editable matrix cells |
| Known obsolete standalone npm declaration | Removal-only cells |
| Recognized Git/local SuPi installation | Explain the conflict and block its affected scope |
| Recognized legacy whole-stack root installation | Explain the conflict and block its affected scope |
| Unknown, newer, or unrelated source | Show as unmanaged; preserve it |

- Match official npm entries by package name, including versioned sources and object-form declarations.
- Preserve exact sources and filters for entries that remain unchanged.
- Do not execute a local package to identify it. Do not assume every arbitrary checkout can be recognized.
- For blocked scopes, show the configured source and manual PI removal instructions. Keep an otherwise eligible scope available.
- Do not migrate sources automatically or delete local checkouts.
- Treat `@mrclrchtr/supi` as a legacy root conflict, not a new-install or removal-only preset member.
- Known obsolete standalone declarations include `@mrclrchtr/supi-agents`, `@mrclrchtr/supi-rtk`, `@mrclrchtr/supi-lsp`, and `@mrclrchtr/supi-tree-sitter`.
- LSP and Tree-sitter remain current Infrastructure Packages. Only their obsolete direct installation declarations are cleanup choices; do not target bundled dependencies.
- A removal-only cell is editable only where the declaration existed at startup. Users can clear it and undo that draft removal; they cannot add it to another scope.

## Plan, confirmation, and execution

1. Read the current inventory and initialize the matrix.
2. Let the user edit the draft.
3. Show every addition and removal, with its scope and exact source. Show scope restrictions and the project path.
4. State that clearing a project declaration can expose a global declaration and that removal does not purge user data.
5. Require explicit confirmation before package commands run.
6. Re-read relevant state. Refuse an observed stale plan and require a new review if settings or trust eligibility changed.
7. Attempt additions before removals, with portable child-process invocation and the selected project directory as cwd.
8. Refresh the inventory and report the actual result.

- A no-change plan runs no package commands. It does not repair missing package files.
- Add a new declaration with `pi install npm:@mrclrchtr/<package>`; add `--local` for Project.
- Use unpinned sources for new declarations. Do not align them to the CLI version.
- Remove an existing declaration through `pi remove <existing-source>` in its scope.
- Do not reinstall or rewrite unchanged entries. Do not reset pins or filters, or run updates as a side effect.
- Do not rewrite settings directly to apply the plan. PI owns package changes and persistence.
- Normal removal includes PI's managed-package removal. Do not add a purge of SuPi configuration, credentials, sessions, reports, or local source directories.
- Do not remove the other scope's declaration or another selected package because it supplies related behavior.
- Do not construct shell command strings from package names or paths.

## Failure and cancellation

- Continue independent cell operations after a command failure.
- Treat both scope cells as independent, including scope moves.
- A failed destination addition does not prevent the source removal. This can leave neither declaration; state this risk in the review.
- Do not infer replacement dependencies between different package rows.
- Do not attempt automatic rollback or claim an atomic transaction.
- Report each successful, failed, and unattempted operation, plus final declarations in both scopes.
- A command failure must produce an unsuccessful exit status, even if other operations succeed.
- Cancellation stops new commands, stops the active child where possible, restores the terminal, and reports partial results.
- If observed state becomes stale during execution, stop new commands and require a new review. Do not override external edits to finish the old plan.
- A rerun starts from actual declarations, not the previous draft. Do not claim that a failed command left no downloaded files or other package-manager effects.
- Remind the user to `/reload` or restart PI after changes.

## Verification requirements

| Area | Required cases |
| --- | --- |
| Inventory | Missing files, malformed files, string/object entries, pins, filters, both scopes, unchanged entries |
| Paths | Current directory, `--project`, nested non-root directory, spaces, Unicode, agent-directory override, canonical paths |
| Trust | Exact approval, ancestor approval, nearer denial, absent approval, malformed store, no implicit approval, global-only exit |
| Catalog | All current workspace Extension Packages, no Infrastructure Package install choices, exact Recommended membership, no live catalog |
| Draft | Two independent cells per row, preset replacement in one column, inherited global labels, removal-only undo, blocked scopes |
| Review | Exact scoped changes, explicit confirmation, no-op, stale state, independent-move failure warning |
| Execution | Correct cwd and scope, unpinned additions, preserved existing sources, no shell interpolation, no updates or purge |
| Failures | Failed addition followed by independent removal, failed scope move with source removal, multiple failures, final inventory, unsuccessful exit status |
| Cancellation | Before confirmation, during a child command, partial report, restored terminal |
| Invocation | Non-terminal rejection, read-only dry run, help/version, missing PI, no unattended mutation flags |
| Packaging | Published executable, clean `npx` invocation, no PI extension manifest, no Bash dependency, macOS/Linux/Windows process handling |

- Use fixtures and a fake PI executable for automated package-command tests. Do not modify developer settings or trust state.
- Add terminal interaction tests and manual terminal checks for the two-column matrix.
- Run `pnpm verify:ai` and the applicable package/publish checks when implementation changes code or packaging.

## Verification record

| Check | Result |
| --- | --- |
| Installer tests | 36 passed |
| Workspace lint, typecheck, skills, and WASM checks | Passed during `pnpm verify:ai` |
| Full test suite with `pnpm test:ai --maxWorkers=2` | 513 files passed; 4,366 tests passed; 2 skipped |
| Default `pnpm verify:ai` test execution | Two runs hit existing 2-second timeouts in `scripts/__tests__/pi-upgrade.test.mjs`; the affected test file passed alone |
| `pnpm pack:verify` | All 23 publishable packages passed |
| Clean-cache local-tarball `npm exec` | Executable help passed without a workspace loader |
| Real pseudo-terminal check | Selection, review, confirmation, fake PI execution, and terminal restoration passed |
| Follow-up Standards review | No remaining findings |
| Follow-up Spec review | No remaining findings |

- Keep the unrelated upgrade tests unchanged. The complete suite passed with two workers.
- Cross-platform CI covers macOS, Linux, and Windows; Linux also checks PI's minimum Node runtime. Those remote jobs were not run in the local session.
- Review regressions cover command-tree cancellation through npm-style shims, preflight cancellation, and Git fragment refs.
- The process-level SIGTERM test runs only on Unix. Windows command-boundary cancellation tests still run; Windows `child.kill("SIGTERM")` does not deliver a console Ctrl-C event.

## Sources

- [PI packages](https://github.com/earendil-works/pi/blob/main/docs/packages.md): scope, package identity, filters, and declarations.
- [PI CLI](https://github.com/earendil-works/pi/blob/main/docs/cli.md): install, remove, and trust options.
- [PI security](https://github.com/earendil-works/pi/blob/main/docs/security.md): saved trust and command-level approval.
- [PI environment variables](https://github.com/earendil-works/pi/blob/main/docs/environment-variables.md): agent-directory override.
- Installed PI source checks: `dist/package-manager-cli.js` (`handlePackageCommand`); `dist/core/package-manager.js` (`installAndPersist`, `removeAndPersist`); `dist/core/trust-manager.js` (`ProjectTrustStore`). Local package changes require trust; `--no-approve` is not a way to bypass that requirement.
