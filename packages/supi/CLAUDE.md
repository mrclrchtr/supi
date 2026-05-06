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
  - `src/cache.ts`
  - `src/code-intelligence.ts`
  - `src/flow.ts`
  - `src/insights.ts`
- Sub-packages self-register prompts, skills, and themes via `resources_discover` — the meta-package does not need static `pi.prompts` or `pi.skills` entries.
## Packaging gotchas

- `pi.extensions` entries are package-relative paths.
- Keep small local wrapper `.ts` files in this package so published installs do not depend on nested workspace `node_modules` layout.
- All sub-packages must be listed in both `dependencies` and `bundledDependencies` — pi's [packages docs](https://github.com/mariozechner/pi-coding-agent/blob/main/docs/packages.md) require bundling because pi loads packages with separate module roots.
- The workspace uses `nodeLinker: hoisted` (in `pnpm-workspace.yaml`) because pnpm's default isolated linker does not support `bundledDependencies`.

## Validation

- `pnpm exec biome check packages/supi && pnpm vitest run packages/supi/ && pnpm exec tsc --noEmit -p packages/supi/tsconfig.json`
