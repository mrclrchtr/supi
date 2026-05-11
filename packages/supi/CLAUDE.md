# CLAUDE.md

This file provides guidance to Claude Code when working in `packages/supi/`.

## Scope

`@mrclrchtr/supi` is the published meta-package bundling the full SuPi stack.

## Key responsibilities

Each `src/*.ts` is a thin wrapper that imports and re-exports the corresponding sub-package's default export. pi's `package.json` `extensions` array points to these wrappers so the published tarball resolves dependencies from its own `node_modules` rather than relying on workspace layout.

Sub-packages self-register prompts, skills, and themes via `resources_discover`. The meta-package does not need static `pi.prompts` or `pi.skills` entries.

## Commands

```bash
pnpm vitest run packages/supi/
pnpm exec tsc --noEmit -p packages/supi/tsconfig.json
pnpm exec biome check packages/supi/
```

## Packaging gotchas

- `pi.extensions` entries are package-relative paths.
- Keep small local wrapper `.ts` files in this package so published installs do not depend on nested workspace `node_modules` layout.
- All sub-packages must be listed in both `dependencies` and `bundledDependencies`. pi's [packages docs](https://github.com/earendil-works/pi/blob/main/docs/packages.md) require bundling because pi loads packages with separate module roots.
- External runtime dependencies imported by a bundled sub-package must also be present in `packages/supi/package.json` `dependencies`; the published tarball includes the sub-package source, but Node resolves those imports from `@mrclrchtr/supi`'s own `node_modules`.
- The workspace uses `nodeLinker: hoisted` (in `pnpm-workspace.yaml`) because pnpm's default isolated linker does not support `bundledDependencies`.
- `@mrclrchtr/supi-tree-sitter` venders all grammar WASM files in `resources/`. Its native `tree-sitter-*` deps are `devDependencies` only — do NOT add them to the meta-package's `dependencies`. Only `web-tree-sitter` is a runtime dep of `supi-tree-sitter` and must remain in the meta-package's `dependencies`.
