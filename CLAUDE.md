# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Overview

SuPi (**Super Pi**) is an opinionated extension repo for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent) (`@mariozechner/pi-coding-agent`).

**Slogan:** *The opinionated way to extend PI.*

It is a pnpm workspace monorepo of installable pi extensions. pi loads the extensions directly as TypeScript — there is no build step.

Install into pi:
```bash
# Full stack
pi install /path/to/SuPi
pi install git:github.com/mrclrchtr/supi

# Individual extensions from local checkout
pi install /path/to/SuPi/packages/supi-lsp
pi install /path/to/SuPi/packages/supi-ask-user
```

## Commands

```bash
# Install pinned local tools
mise install

# Install dependencies
pnpm install

# Install repo git hooks
mise run hooks

# Full verification suite (runs on pre-push)
pnpm verify

# Type-check all extensions (no emit)
pnpm typecheck

# Type-check test files only
pnpm typecheck:tests

# Lint/format check (AI-friendly output)
pnpm biome:ai

# Auto-fix lint/format issues
pnpm biome:fix && pnpm biome:ai

# Fix formatting/imports on touched files only
pnpm exec biome check --write <files...>

# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Run hook suites locally
hk run fix
hk run check

# Dry-run npm pack for the meta-package
pnpm pack:check
```

Toolchain versions are pinned in `.mise.toml`. Root automation/config files include `hk.pkl`, `vitest.workspace.ts`, `commitlint.config.mjs`, `release-please-config.json`, and `.release-please-manifest.json`.

## Architecture

This repo has two install surfaces:
- repository root `package.json` exposes a `pi` manifest for local-path and git installs
- `packages/supi/` is the published meta-package bundling the full stack

Current workspace packages:
- `packages/supi-aliases` — `/exit`, `/e`, `/clear` shortcuts
- `packages/supi-ask-user` — structured questionnaire UI + `ask_user` tool
- `packages/supi-bash-timeout` — default timeout injection for `bash`
- `packages/supi-lsp` — Language Server Protocol integration + diagnostics guardrails
- `packages/supi-skill-shortcut` — `$skill-name` shorthand for `/skill:name`
- `packages/supi` — meta-package, prompts, and bundled skills

Other notable areas:
- `openspec/changes/` and `openspec/specs/` — experimental OpenSpec artifacts
- `.pi/skills/` and `.agents/skills/` — local skill material used by the repo/tooling

## Package CLAUDE map

Keep repo-wide guidance here. Keep deep package-specific guidance in local `CLAUDE.md` files:
- `packages/supi/CLAUDE.md` — meta-package wrapper entrypoints, prompts, and skills
- `packages/supi-lsp/CLAUDE.md` — LSP tool behavior, diagnostics flow, config, and tests
- `packages/supi-ask-user/CLAUDE.md` — rich/fallback UI behavior, interaction rules, and tests
- `packages/supi-skill-shortcut/CLAUDE.md` — pi-tui internals and upgrade hazards

## Reading pi docs

When working on pi-specific APIs, read the installed pi docs and examples instead of guessing.

With mise, the docs live under:
`~/.local/share/mise/installs/node/<version>/lib/node_modules/@mariozechner/pi-coding-agent/`

Start with:
- `README.md`
- `docs/extensions.md`
- `docs/packages.md`
- `docs/prompt-templates.md`
- `docs/skills.md`
- `docs/tui.md`
- `examples/extensions/`

## Shared gotchas

- pi loads these extensions from the working tree directly; after edits, use `/reload` or restart pi.
- `pi.on("tool_result")` can modify tool output; `pi.on("tool_call")` can only block.
- Session cleanup event is `session_shutdown`, not `session_end`.
- `ctx.ui.notify()` uses `"warning"`, not `"warn"`.
- Keep runtime-imported packages in `peerDependencies`; after changing version ranges run `pnpm install` to refresh the lockfile.
- Avoid TS JSON import assertions here; prefer `JSON.parse(fs.readFileSync(..., "utf-8"))`. pi's jiti loader provides `__dirname`.
- Biome config lives in `biome.jsonc`. For new tests, run `pnpm exec biome check --write <files...>` before verifying.
- `hk` drives local hooks: `pre-commit` autofixes, `pre-push` runs `pnpm verify`.
- Releases are automated via release-please; there is no local release command.
- OpenSpec `PostHogFetchNetworkError` output is harmless when offline.
