# CLAUDE.md

This file provides guidance to Claude Code when working in `packages/supi/`.

## Scope

`@mrclrchtr/supi` is the published meta-package bundling the full SuPi stack.

## Key responsibilities

- re-export workspace extensions through local wrapper entrypoints in `src/`:
  - `src/extras.ts`
  - `src/ask-user.ts`
  - `src/bash-timeout.ts`
  - `src/claude-md.ts`
  - `src/settings.ts`
  - `src/lsp.ts`
  - `src/tree-sitter.ts`
  - `src/resources.ts`
  - `src/cache-monitor.ts`
  - `src/code-intelligence.ts`
  - `src/flow.ts`
  - `src/insights.ts`
- expose bundled prompt templates from `prompts/`

## Packaging gotchas

- `pi.extensions` and `pi.prompts` entries are package-relative paths.
- Keep small local wrapper `.ts` files in this package so published installs do not depend on nested workspace `node_modules` layout.
- `resources.ts` re-contributes `promptPaths` on `resources_discover`, so prompt changes are visible after `/reload`.

## Prompt templates

- Templates live in `prompts/*.md` and are invoked as `/name` in pi.
- Only `description:` frontmatter is supported; Claude-specific keys like `allowed-tools` are ignored by pi.
- Current template: `prompts/revise-claude-md.md`

## Validation

- `pnpm exec biome check packages/supi && pnpm vitest run packages/supi/ && pnpm exec tsc --noEmit -p packages/supi/tsconfig.json`
