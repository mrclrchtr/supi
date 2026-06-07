# CLAUDE.md

SuPi (**Super Pi**) is a curated extension repo for the [pi coding agent](https://github.com/earendil-works/pi) (`@earendil-works/pi-coding-agent`).

It is a pnpm workspace monorepo of installable pi extensions. pi loads the extensions directly as TypeScript — there is no build step.

## Development status

SuPi is pre-release and not API-stable. Intentional breaking changes to package APIs, commands, configuration formats, and extension behavior are allowed when they improve the design. Do not treat backwards compatibility as a blocker unless a task explicitly asks for it.

## Pi docs-first rule

- Never assume pi harness APIs, behavior, or conventions from memory or model priors.
- Before changing code or giving guidance about pi-specific behavior, read the relevant installed pi docs (`README.md`, matching files in `docs/`, and `examples/`) and follow linked `.md` cross-references.
- Start with `docs/index.md` for getting an overview of PI's docs.

## Documentation expectations

- Add JSDoc for exported APIs, config surfaces, and non-obvious behavior; skip boilerplate for trivial private code.
- Add inline JSDoc for complex internal logic where a short explanation would help maintainers.

## Package layout convention

- Follow `docs/package-layout.md` for repo-wide package structure.
- Standardize package boundaries with `src/api.ts`, `src/index.ts`, and `src/extension.ts` when the package role requires them.
- Prefer package-level tests in `__tests__/unit/` and `__tests__/integration/`, with `__tests__/helpers/` and `__tests__/fixtures/` as needed.
- Prefer domain folders over catch-all names like `core/`, `shared/`, or `misc/`.
- Keep small packages flat; add `config/`, `tool/`, `ui/`, `session/`, or other domain folders only when the package size and responsibilities clearly justify them.
- Current anchor examples: `supi-lsp` uses the hybrid large-package model; `supi-insights` uses the standard package-level test layout.
- This convention is the default for new packages and for existing packages when they receive structural work.
- Packages that should stay flat unless they grow: `supi-bash-timeout`, `supi-context`, `supi-debug`, `supi-rtk`, `supi-test-utils`.
- `supi-web` should stay mostly flat, but may use `src/tool/` for per-tool guidance files and other narrowly scoped tool-specific wiring.

## Commands

See `pnpm run` for routine build/lint/test. Toolchain versions pinned in `.mise.toml`.

- When both standard and `*:ai` scripts exist, prefer the `*:ai` variant for agent runs — they produce lower-noise, more token-efficient output.
- Current root examples: `biome:ai`, `typecheck:ai`, `test:ai`, `check:ai`, `verify:ai`.
- Use the non-`:ai` variant when you specifically want prettier or interactive local output.
- **After changes, run `pnpm verify:ai`** — typecheck, lint, tests in one pass. Prefer over individual checks.

## Architecture

This repo has two install surfaces:
- repository root `package.json` exposes a `pi` manifest for local-path and git installs — supports `extensions`, `prompts`, `skills`, `themes` keys
- each `packages/supi-*` is installable independently

## Package tiers

All packages are published independently. There is no meta-package — each package ships its own dependencies directly.

- Packages that depend on other `@mrclrchtr/supi-*` packages must list them in both `dependencies` and `bundledDependencies`. This applies to packages that still ship `pi.extensions` (installable pi packages). Library-only packages (no `pi.extensions`, no `./extension` export) are regular npm dependencies and do not need bundling — transitive npm resolution is sufficient for them.
- Packages that bundle `@mrclrchtr/supi-*` dependencies must reference their extension entrypoints in `pi.extensions`.

New packages should be added to the root `package.json` `pi.extensions` array for development convenience.

## Packaging conventions

- Every published SuPi pi-package exposes an explicit `./extension` export. Packages with a reusable library API expose an explicit `./api` export (optional — omit when there is no library surface). Do not rely on package-root (`.`) imports or cross-package `src/...` deep imports.
- `supi-core` is the exception — it is a library-only package with no pi extension surface, no `./extension` export, and no `pi.extensions` entry. Other SuPi packages bundle it for the library API only.
- `pi.extensions` / `pi.prompts` / `pi.skills` / `pi.themes` manifest entries must remain **real package-relative file paths**. Do not replace them with `exports` aliases.
- Any SuPi package that depends on another `@mrclrchtr/supi-*` package must list it in both `dependencies` and `bundledDependencies`. Per [pi packages docs](https://github.com/earendil-works/pi/blob/main/docs/packages.md), pi packages that depend on other pi packages must be bundled in the tarball — npm transitive dependency resolution is not guaranteed by pi's module isolation.
- When a package bundles another `@mrclrchtr/supi-*` package, reference that package's extension in `pi.extensions` via `node_modules/<pkg>/src/extension.ts`. Otherwise, standalone `pi install npm:@mrclrchtr/supi-<name>` won't load the bundled extension — pi only reads the top-level installed package's `pi.extensions`.
- Adding bundled extension references breaks `expectExplicitSurface` in `scripts/__tests__/pack-staged.test.mjs` — use `.toContain("./src/extension.ts")`, not `.toEqual(["./src/extension.ts"])`.
- Root `package.json` is `"private": true` — runtime dependencies belong in sub-packages or in root `devDependencies`, not in root `dependencies`.
- For the publish pipeline (staging, manifest export, npm pack, verification), see the **Publish pipeline** section.

## supi-core entry points

`@mrclrchtr/supi-core` exposes 12 domain subpath exports plus a convenience barrel at `./api`. It is library-only — the `/supi-settings` command is now registered by `@mrclrchtr/supi-settings`.

Prefer domain entry points when importing from supi-core — they only load the dependencies needed for that domain. Use `./api` when you need symbols from 3+ domains.

## Self-registering resources via `resources_discover`

SuPi extensions self-register their prompts, skills, and themes using the `resources_discover` event rather than relying on static `pi.prompts` / `pi.skills` / `pi.themes` in `package.json`. This ensures resources are discovered regardless of whether the package is installed standalone or consumed through the workspace root.

Pattern:
```ts
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const baseDir = dirname(dirname(fileURLToPath(import.meta.url)));

export default function (pi: ExtensionAPI) {
  pi.on("resources_discover", () => ({
    skillPaths: [join(baseDir, "skills")],
    promptPaths: [join(baseDir, "prompts")],
  }));
}
```

Extension packages with prompts/skills:
- `packages/supi-claude-md` — skills via `resources_discover`
- Root `package.json` and sub-package `package.json` files omit `pi.prompts` / `pi.skills` entries to avoid redundancy.

## Settings registry

Extensions register settings via `registerSettings()` from `@mrclrchtr/supi-core/api`. Call it during the factory function (not async handlers). Prefer `registerConfigSettings()` for config-backed sections over manual `registerSettings()` + scoped-load + write wiring.

- The registry stores `SettingItem[]` compatible with pi-tui's `SettingsList`.
- `/supi-settings` (from `supi-settings`) renders all registered sections.
- Scope toggle (Tab) switches between project/global; values are strings, extensions handle conversion.
- Submenus use `SettingItem.submenu` returning a pi-tui `Component`; Escape confirms, empty-string done() cancels.

## Shared gotchas

### Event & session semantics
- pi loads these extensions from the working tree directly; after edits, use `/reload` or restart pi.
- `pi.on("tool_result")` can modify tool output after execution; `pi.on("tool_call")` runs before execution — it can mutate input parameters (e.g. inject defaults) or block the call, but cannot add result content.
- Session cleanup event is `session_shutdown`, not `session_end`.
- PI internal events like `session_info_changed` are consumed by the interactive mode only; they are **not** forwarded to extension handlers via `pi.on()`. The `pi.events` EventBus is strictly for extension-to-extension communication.
- `createAgentSession()` child sessions do NOT bubble `agent_start`/`agent_end` to parent extension handlers; use `pi.events` to signal activity from programmatic sub-sessions.
- `pi.events.emit("supi:working:start", { source: "supi-<pkg>" })` / `pi.events.emit("supi:working:end", { source: "supi-<pkg>" })` — generic SuPi convention for indicating long-running work across extensions; `tab-spinner` listens to these. Emitters must ensure `end` always fires (success, failure, cancel, timeout).

### UI & rendering
- `ctx.ui.theme` does not expose an `"info"` color; use existing colors like `"accent"` / `"dim"` for info-level UI.
- PI sets the terminal title directly on `this.ui.terminal` during startup and on `/name` renames — it never flows through `ctx.ui.setTitle`. Intercepting `ctx.ui.setTitle` to capture PI's title won't work; recompute dynamically with `pi.getSessionName()` and `ctx.cwd` instead.

### Dependencies & tool behavior
- Pi core peer deps (`@earendil-works/pi-*`, `typebox`) use `"*"` ranges per Pi package docs; do not tighten them.
- `createBashTool` applies `commandPrefix` **before** `spawnHook`; if your hook needs the raw user command, strip the prefix manually and re-apply it to the result.
- Run `pnpm install` before editing `.ts` files when editing dependencies.

### Dev workflow
- `hk` drives local hooks: `pre-commit` autofixes, `pre-push` runs `pnpm verify`.
- `pnpm exec jiti /tmp/script.mjs` — ad-hoc workspace TS runtime probes; Node `--experimental-strip-types` breaks on TS parameter properties here.
- pnpm `ignoredBuiltDependencies` silently skips install scripts; `onlyBuiltDependencies` explicitly allows them — confusing the two causes missing native binaries (e.g. tree-sitter-cli).
- RTK fallback warnings (`rtk/fallback: non-zero-exit`) are rewrite-attempt noise, not actual failures — the bash command usually succeeds afterward.

> For per-package gotchas (session entry parsing, message rendering, config patterns, WASM quirks), see individual `packages/*/CLAUDE.md` files — injected automatically by supi-claude-md when working in that directory.
## Publish pipeline

Published npm tarballs must produce npm-compatible manifests because PI installs packages via `npm install`. The pipeline has four stages:

1. **Standalone staging** — `scripts/pack-staged.mjs` copies a workspace package into a clean staging directory, dereferencing workspace symlinks.
2. **Manifest export** — `scripts/staged-manifests.mjs` uses pnpm's `@pnpm/exportable-manifest` to rewrite staged workspace `package.json` files: `workspace:*` → exact version (`1.5.0`), `workspace:~` → `~1.5.0`, `workspace:^` → `^1.5.0`. It also strips `devDependencies` from publish manifests so private workspace-only test utilities never leak, and preserves `bundledDependencies`.
3. **npm pack + tarball verification** — The cleaned staged directory is packed with `npm pack`, then `scripts/verify-tarball.mjs` rejects `../` paths and `workspace:` protocol in every packed `package.json` and checks extraction succeeds.

Run:
```bash
node scripts/publish.mjs packages/supi-lsp     # pack + verify
node scripts/publish.mjs packages/supi-lsp --publish  # pack + verify + publish
```

`pack:check` runs this pipeline as a dry-run for all publishable packages. `pack:verify` runs the full pack + tarball verification for all 16 packages via a parallel Node.js runner (`scripts/pack-all.mjs`).

Root cause for the staging pipeline: direct `pnpm pack` on workspace packages produces tarball entries with `../` paths to the root `node_modules`. The staged `cp -RL` + `npm pack` approach avoids this because npm produces correct tarballs from a flat, dereferenced `node_modules`.

## Release & tagging convention

- **Single tag per release**: `vX.Y.Z` (not per-package tags), driven by release-please configured at the repo root with `include-component-in-tag: false`.
- **Single GitHub release**: One release matching the tag — release-please creates it when the release PR is merged.
- **Unified versioning**: All `packages/*/package.json` versions are synced in lockstep by release-please via `extra-files` in `release-please-config.json`. If any package triggers a breaking change, every package bumps major.
- **Config files**:
  - `release-please-config.json` — single root (`.`) package with `release-type: node`, `include-component-in-tag: false`, and all framework package.jsons listed in `extra-files`
  - `.release-please-manifest.json` — single entry `{".": "<version>"}`
- Per-package npm publish uses the matching version from the workspace.
- Release-please manages the `.release-please-manifest.json` automatically — do not edit it manually.
- To trigger a manual release outside the automated cycle:
  ```bash
  git tag -m "vX.Y.Z" "vX.Y.Z"
  git push origin "vX.Y.Z"
  gh release create "vX.Y.Z" --title "vX.Y.Z" --notes "..." --latest
  ```

## Testing patterns

- `vi.hoisted()` callbacks execute before imports — must be inline arrow functions, cannot reference imported values; supports both single-value (`vi.hoisted(() => vi.fn())`) and object (`vi.hoisted(() => ({ fn: vi.fn() }))`) patterns
- Each test file that mocks modules needs its own top-level `vi.hoisted` + `vi.mock` calls; can't share through helper functions
- Biome enforces `noExcessiveLinesPerFunction` (120) and `noExcessiveLinesPerFile` (400, nursery) on test files too — split large describe blocks into separate test files
- Use `createPiMock()` / `makeCtx()` from `@mrclrchtr/supi-test-utils` for pi mocks instead of defining local factories — includes `events`, `getActiveTools`, `sendMessage`, `registerShortcut`, `exec`, `emit`, and `getAllTools`
- Extension integration tests: mock internal modules, create fake `pi` object capturing handlers via `Map`, then call handlers directly
- Package-scoped commands: `pnpm vitest run packages/<pkg>/`, `pnpm exec biome check packages/<pkg>`, `pnpm exec tsc -b packages/<pkg>/tsconfig.json`. For shared-config changes, sweep `packages/supi-core/ packages/supi-lsp/ packages/supi-claude-md/`.
- Global-scope tests for `registerConfigSettings` should pass `homeDir` in the options object rather than mutating `process.env.HOME`.
- `pnpm exec biome check --write --unsafe <files>` — auto-fix unused imports. `--max-diagnostics=20` caps output when the full check OOMs.
- `ctx.ui.select()` accepts only `string[]`; use label-encoding (e.g. `"[id] name"`) if you need metadata
- `vi.useFakeTimers()` + `vi.advanceTimersByTime(ms)` — required to trigger `setInterval` callbacks in vitest
- In Vitest 4.x, constructor mocks inside `vi.mock` factories must use `class` — `vi.fn().mockImplementation(() => ({}))` silently returns `this` instead of the object
- `vi.mock` hoisting errors propagate from the importing module (e.g. `runner.ts:2:1`), not the test file's `vi.mock` call site — check the Caused-by chain
- Shared `createPiMock` stores handlers as `Map<string, handler[]>` — access as `handlers.get(event)?.[0]`, not `handlers.get(event)!`
- `pi.handlers.get("event")?.[0]!` triggers Biome `noNonNullAssertedOptionalChain` (blocks CI); use `getHandlerOrThrow(pi, event)` from `@mrclrchtr/supi-test-utils` instead
- `pnpm vitest run` strips types (esbuild) — always run per-package `pnpm exec tsc -b packages/<pkg>/tsconfig.json packages/<pkg>/__tests__/tsconfig.json` alongside.
- Adding exports to `supi-core/index.ts` or deleting source files breaks downstream `vi.mock` factories — audit all consuming test files.
- **Deleting a source file breaks every test with `vi.mock("../<file>")` referencing it** — audit all test files for stale mock factories after module deletion
- **Removing code may leave `// biome-ignore` suppression comments unused** — Biome flags these; remove them
- **Changing state shape requires updating every `createInitialState` mock in test files** — keep mock shapes in sync with real types
- New workspace package: add `package.json` + `tsconfig.json` + `__tests__/tsconfig.json`, wire into root `pi.extensions` array, run `pnpm install`
- Package-scoped test tsconfig: `{"extends": "../../../tsconfig.json", "include": ["*.ts"], "exclude": []}`
- Module-level `let`/`const` state (e.g., lazy-init singleton client) persists across Vitest tests because ES modules are cached — use behavioral verification (what the function returns or calls) instead of counting constructor invocations
- Prefer `import { x } from "../src/module.ts"` over `const { x } = await import("../src/module.ts")` in test files — dynamic imports interact inconsistently with `vi.mock` hoisting in some Vitest 4.x edge cases
