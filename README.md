# SuPi

**Super Pi**

*The opinionated way to extend PI.*

SuPi is an opinionated extension monorepo for PI with LSP, Skills, marketplace compatibility, and personal best practices built in.

- SuPi is my curated extension stack for PI.
- SuPi makes PI extensible, interoperable, and sane by default.
- Install the full stack or pick individual extensions.

Built for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

## Extensions

| Package | Extension | Description |
|---------|-----------|-------------|
| `@mrclrchtr/supi-aliases` | **aliases** | Registers `/exit` to quit pi, `/e` as a shorthand alias, and `/clear` to start a new session (alias for `/new`) |
| `@mrclrchtr/supi-bash-timeout` | **bash-timeout** | Injects a default timeout on every bash tool call when the LLM omits one. Configurable via `PI_BASH_DEFAULT_TIMEOUT` (seconds, default 120). |
| `@mrclrchtr/supi-skill-shortcut` | **skill-shortcut** | Type `$skill-name` as a shorthand for `/skill:skill-name`. Autocomplete triggers on `$`. |
| `@mrclrchtr/supi-ask-user` | **ask-user** | Rich questionnaire UI for structured agent–user decisions. |
| `@mrclrchtr/supi-lsp` | **lsp** | Adds Language Server Protocol support for hover, definitions, references, symbols, rename, code actions, and diagnostics. It appends inline diagnostics after `write`/`edit`, advertises semantic-first tool guidance, and injects stateful pre-turn guidance that activates only after the session touches a supported source file. |

## Skills

| Skill | Description |
|-------|-------------|
| **supi-openspec-brainstorm** | Structured brainstorming for OpenSpec changes. It turns an idea into an approved change direction by exploring context, asking one question at a time, comparing approaches, and then recommending the best next OpenSpec skill before implementation starts. |

Invoke it with `/skill:supi-openspec-brainstorm`.

## Install

### Full stack (meta-package)

```bash
pi install npm:@mrclrchtr/supi
```

### Individual extensions

```bash
pi install npm:@mrclrchtr/supi-lsp
pi install npm:@mrclrchtr/supi-ask-user
pi install npm:@mrclrchtr/supi-skill-shortcut
pi install npm:@mrclrchtr/supi-bash-timeout
pi install npm:@mrclrchtr/supi-aliases
```

### From git or local path

```bash
# Full stack from git
pi install git:github.com/mrclrchtr/supi

# Individual extension from local checkout
pi install /path/to/SuPi/packages/supi-lsp
pi install /path/to/SuPi/packages/supi-ask-user
```

When installed from a local path, pi loads the working tree directly; after edits, use `/reload` or restart pi to pick up extension changes.

## LSP extension

The `lsp` extension is meant to make pi more semantic in supported languages:

- exposes a single `lsp` tool with actions for hover, definition, references, diagnostics, symbols, rename, and code actions
- appends LSP diagnostics after `write`/`edit`
- performs a proactive project scan at `session_start` to detect matching roots and available language servers, then eagerly starts them
- builds project-specific semantic-first `promptSnippet` / `promptGuidelines` from detected servers, roots, file types, and supported actions so the agent prefers `lsp` for code navigation and diagnostics
- injects compact XML-framed diagnostic context only when outstanding diagnostics exist, deduped across turns so unchanged diagnostics do not re-inject
- provides `/lsp-status` for server roots, capabilities, open files, and diagnostics

Configuration:

- `PI_LSP_DISABLED=1` — disable the extension
- `PI_LSP_SERVERS=rust-analyzer,pyright` — allow-list servers
- `PI_LSP_SEVERITY=1|2|3|4` — inline diagnostic threshold
- `.pi-lsp.json` in the project root — override/add/disable server definitions

## Development

```bash
mise install
pnpm install
mise run hooks
pnpm typecheck
pnpm biome
pnpm biome:fix
pnpm biome:ci
pnpm biome:ai
pnpm test
pnpm pack:check
pnpm verify
hk run check # local pre-push checks (full pnpm verify)
hk run fix   # local pre-commit autofixes
```

Biome is configured in `biome.jsonc` with formatting, import organization, recommended lint rules, and stricter project/types/test plus aggressive complexity and nursery rules.

## Publishing

This is a pnpm workspace monorepo. Each extension is a standalone package under `packages/supi-*/`. The `packages/supi/` meta-package bundles the full stack for convenience.

Pi package docs require a `pi` manifest per package and recommend the `pi-package` keyword for discoverability. All packages publish TypeScript source directly — pi loads extensions without a build step.

GitHub Actions handles verification and releases:

- `CI` runs typecheck, Biome, Vitest, and `npm pack --dry-run`
- `Conventional Commits` lints PR titles and commit messages
- `Actionlint` validates GitHub Actions workflows
- `Release Please` runs on pushes to `main`, parses conventional commits, opens a "Release Please" PR with version bumps and changelogs, and — once that PR is merged — creates GitHub releases and publishes all updated packages to npm

### One-time setup

- Ensure the publishing account owns the `@mrclrchtr` npm scope
- Configure npm trusted publishing for this GitHub repository so the release workflow can publish with OIDC
- Use Conventional Commits on merges to `main` so release-please can compute versions (`feat:` = minor, `fix:` = patch, `!` / `BREAKING CHANGE:` = major)

### Release flow

1. Merge PRs to `main` using Conventional Commits
2. The `Release Please` workflow opens a "Release Please" PR with version bumps and changelogs
3. Review and merge the "Release Please" PR
4. The workflow creates GitHub releases and publishes updated packages to npm automatically

Releases are driven by [release-please](https://github.com/googleapis/release-please) with the `node-workspace` plugin. Each package versions independently based on the commits that touched its files.
