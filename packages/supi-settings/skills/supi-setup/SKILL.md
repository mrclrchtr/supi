---
name: supi-setup
description: Audit SuPi packages and configuration for the current project and propose fixes.
disable-model-invocation: true
---

# SuPi setup audit

Audit how SuPi is installed and configured for the current project, then propose fixes. **Report first; change nothing until the user confirms each change.**

Every finding carries its **evidence**: the file, command output, or tool result that shows it. A suspicion without evidence goes under "Not checked" instead of becoming a finding.

## Sources of truth

| What | Where |
| --- | --- |
| Global SuPi config | `~/.pi/agent/supi/config.json` |
| Project SuPi config (overrides global per key) | `.pi/supi/config.json` |
| Package declarations | `pi list` (project and user scope) |
| Server health and TypeScript backend | `code_health({ include: ["servers"] })` |
| Setting semantics | Each package's README (installed package directory, or `https://github.com/mrclrchtr/supi/tree/main/packages/<package>#readme`) |

Read both config files before any check. A missing file is normal; invalid JSON is a finding.

## Checks

Run every check. Each ends with a verdict: **ok**, **finding**, or **not checked** (with the reason, e.g. package not installed, tool unavailable).

### 1. Package declarations

Run `pi list`.

- **Obsolete direct declarations**: `@mrclrchtr/supi-agents`, `@mrclrchtr/supi-rtk`, `@mrclrchtr/supi-lsp`, `@mrclrchtr/supi-tree-sitter`. LSP and Tree-sitter are still bundled by Code Intelligence; only their direct declarations are obsolete. Propose `pi remove npm:<name>` (add `--local` for project scope).
- **Legacy root package** `@mrclrchtr/supi`, or Git/local SuPi checkouts outside SuPi development: conflicts that block the installer for that scope. Propose removal with `pi remove <source>`.
- **The same package in both scopes**: the project entry replaces the personal one (with `autoload: false` it filters the personal package instead). Report it; propose keeping one only if the user did not intend the override.
- **Missing recommended packages**: propose `npx @mrclrchtr/supi-installer@latest` and pressing `r` for the Recommended column. The installer is interactive; the user runs it.
- **Suggestions from project signals**, only with evidence, for example `supi-review` for a Git repository with active branches, or `supi-claude-md` when `CLAUDE.md` or `AGENTS.md` exists.

### 2. Language servers

Call `code_health({ include: ["servers"] })`. Compare it with the languages the project actually contains (manifests and file extensions).

- A detected language whose server is missing or failed is a finding. Name the server command from the `supi-lsp` README route matrix. SuPi never installs servers.
- TypeScript: report the active backend (`native` or `tsserver`) and compiler version. A selection failure or configuration conflict is a finding.
- Servers running for languages the project does not use are fine; do not propose disabling them unless they fail.

### 3. TypeScript code-action formatting

TypeScript servers format organize-imports and unused-import edits with their own defaults (4-space indentation) unless `lsp.servers.typescript.settings` says otherwise. SuPi does not infer formatting from project files.

1. Determine the project's indentation from the formatter config in effect: `biome.json`/`biome.jsonc` (`formatter.indentStyle`, `formatter.indentWidth`), Prettier config (`tabWidth`, `useTabs`), or `.editorconfig` (`indent_style`, `indent_size`). Note which source you used. With no source, report "not checked".
2. Compare with `lsp.servers.typescript.settings.typescript.format` and `.javascript.format` (`indentSize`, `tabSize`, `convertTabsToSpaces`).
3. A mismatch, or no settings while the project indentation is not 4 spaces, is a finding. Propose the settings in project scope:

```json
{
  "lsp": {
    "servers": {
      "typescript": {
        "settings": {
          "typescript": { "format": { "indentSize": 2, "tabSize": 2, "convertTabsToSpaces": true } },
          "javascript": { "format": { "indentSize": 2, "tabSize": 2, "convertTabsToSpaces": true } }
        }
      }
    }
  }
}
```

Skip this check when the project has no TypeScript or JavaScript.

### 4. Code Intelligence exclusions

Automatic LSP work already skips `.git`, `.cache`, `.pi`, `.pnpm`, `node_modules`, `dist`, `build`, `out`, `coverage`, `.next`, `.nuxt`, `.turbo`, `__pycache__`, and `.gitignore` matches.

- Look for large **generated or vendored** directories that are none of these: tracked or non-ignored (`git ls-files`, `git status --porcelain --ignored=no`), e.g. `generated/`, `vendor/`, `third_party/`, snapshot or fixture dumps. Count files to show the size.
- A large generated directory not covered is a finding. Propose a `code-intelligence.exclude` pattern (gitignore syntax). Remember that a project list **replaces** the global list.
- Hand-written source is never an exclusion candidate, even when large.

### 5. Stale or orphaned config

- `lsp.exclude` is a migration error: propose moving it to `code-intelligence.exclude`.
- A top-level section whose owning package is not declared (check 1) is dead config. Report it; propose removal only if the user confirms the package is gone for good.

| Section | Owning package |
| --- | --- |
| `agent` | `supi-agent` |
| `ask-user` | `supi-ask-user` |
| `bash-timeout` | `supi-bash-timeout` |
| `cache` | `supi-cache` |
| `code-intelligence`, `lsp` | `supi-code-intelligence` |
| `consulting` | `supi-consulting` |
| `context` | `supi-context` |
| `debug` | `supi-debug` |
| `insights` | `supi-insights` |
| `promptImprover` | `supi-prompt-improver` |
| `promptSuggestions` | `supi-prompt-suggestions` |
| `review` | `supi-review` |
| `sessionCapabilities` | `supi-extras` |
| `skills` | `supi-skills` |
| `web` | `supi-web` |

An unknown top-level section is a finding with the verdict "unknown; verify against the package READMEs".

### 6. Review bootstrap

Only when `supi-review` is declared. `review.bootstrapCommand` runs once in each frozen Review Workspace.

- A JavaScript project with a lockfile and no bootstrap command: propose the matching install command (`pnpm install --frozen-lockfile`, `npm ci`, `yarn install --immutable`, `bun install --frozen-lockfile`).
- A bootstrap command for a different package manager than the lockfile is a finding.
- Other ecosystems: suggest a command only when the project documents one.

## Report

Present one table, one row per check:

| Check | Verdict | Evidence | Proposed change |
| --- | --- | --- | --- |

Then list the proposed changes as exact JSON patches for the target config file, or exact commands. Default to **project scope**; propose global scope only for settings that are personal rather than project facts (e.g. models).

## Apply

Ask the user which proposed changes to apply. For each confirmed change:

- Config: edit the scoped `config.json` with a minimal edit that preserves every other key. `/supi-settings` is an alternative for settings it exposes.
- Packages: run `pi remove …` yourself when confirmed. Leave the interactive installer to the user.

Finish by telling the user to run `/reload` or restart Pi, and list any checks reported as "not checked".
