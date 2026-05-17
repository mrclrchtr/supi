# CLAUDE.md

This file provides guidance to Claude Code when working in `packages/supi/`.

## Scope

`@mrclrchtr/supi` is the published meta-package bundling the Production SuPi packages.

## Package tiers

| Tier | Meets | Included in meta-package |
|---|---|---|
| **Production** | Stable, well-tested, core functionality | ✅ Bundled via `@mrclrchtr/supi` — users get these when they `npm install @mrclrchtr/supi` |
| **Beta** | Experimental, less mature, niche | ❌ Direct-install only: `npm install @mrclrchtr/supi-<name>` |

### Production packages

`supi-core`, `supi-ask-user`, `supi-bash-timeout`, `supi-claude-md`, `supi-extras`, `supi-lsp`, `supi-tree-sitter`, `supi-code-intelligence`, `supi-debug`, `supi-context`

### Beta packages

`supi-cache`, `supi-insights`, `supi-review`, `supi-rtk`, `supi-web`

## Key responsibilities

`src/extension.ts` is the single aggregated extension entrypoint for the Production stack. `src/api.ts` is the explicit umbrella API surface, re-exporting Production package `/api` surfaces under namespaced exports.

Sub-packages self-register prompts, skills, and themes via `resources_discover`. The meta-package does not need static `pi.prompts` or `pi.skills` entries.

## Commands

```bash
pnpm vitest run packages/supi/
pnpm exec tsc --noEmit -p packages/supi/tsconfig.json
pnpm exec biome check packages/supi/
```

## Packaging gotchas

- `pi.extensions` entries are package-relative **file paths**. Do not point them at `exports` aliases like `./extension`.
- Consumers import explicit subpaths only: `/extension` for extension entrypoints and `/api` for programmatic APIs. Do not use package-root (`.`) imports or `src/...` deep imports.
- All Production sub-packages must be listed in both `dependencies` and `bundledDependencies`. pi's [packages docs](https://github.com/earendil-works/pi/blob/main/docs/packages.md) require bundling because pi loads packages with separate module roots.
- The meta-package is assembled from packed standalone tarballs extracted into `node_modules/`. Treat standalone tarballs as the source of truth; do not depend on raw workspace `node_modules` layout.
- External runtime deps belong in the standalone package that imports them. `packages/supi/package.json` should only list third-party runtime deps that the meta-package itself imports directly.
