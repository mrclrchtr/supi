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
- Anchor examples: the large-package model (hybrid with domain folders) and the standard package model (flat with package-level tests).
- This convention is the default for new packages and for existing packages when they receive structural work.
- Packages that should stay flat unless they grow: `supi-bash-timeout`, `supi-context`, `supi-debug`, `supi-test-utils`.
- `supi-skill-patches` is a private maintenance package. It owns upstream synchronization and per-file compatibility patches; generated skills live in the root `skills/` catalog for skills.sh.
- `supi-web` should stay mostly flat, but may use `src/tool/` for per-tool guidance files.

## Commands

See `pnpm run` for routine build/lint/test. Toolchain versions pinned in `.mise.toml`.

- When both standard and `*:ai` scripts exist, prefer the `*:ai` variant for agent runs — they produce lower-noise, more token-efficient output.
- Current root examples: `biome:ai`, `typecheck:ai`, `test:ai`, `check:ai`, `verify:ai`.
- Use the non-`:ai` variant when you specifically want prettier or interactive local output.
- Run `pnpm verify:ai` (typecheck, lint, tests) for code, test, dependency, or package/config changes; skip it for specs, docs, and skill-only changes unless requested.

## Architecture

This repo has two install surfaces:
- repository root `package.json` exposes a `pi` manifest for local-path and git installs — supports `extensions`, `prompts`, `skills`, `themes` keys
- each `packages/supi-*` is installable independently

## Package tiers

All runtime packages are published independently. There is no meta-package — each published package ships its own dependencies directly. `supi-skill-patches` is private maintenance tooling.

- Packages that depend on other `@mrclrchtr/supi-*` packages must list them in both `dependencies` and `bundledDependencies`. This applies to packages that still ship `pi.extensions` (installable pi packages). Library-only packages (no `pi.extensions`, no `./extension` export) are regular npm dependencies and do not need bundling — transitive npm resolution is sufficient for them.
- Installable packages that bundle `@mrclrchtr/supi-*` dependencies must reference their extension entrypoints in `pi.extensions`.

New installable extension packages should be added to the root `package.json` `pi.extensions` array for development convenience; library-only packages must not be added there.

## Packaging conventions

- Every published SuPi pi-package exposes an explicit `./extension` export. Packages with a reusable library API expose an explicit `./api` export (optional — omit when there is no library surface). Do not rely on package-root (`.`) imports or cross-package `src/...` deep imports.
- `supi-core` and `supi-agent-runtime` are library-only packages with no pi extension surface, no `./extension` export, and no `pi.extensions` entry. Library-only dependencies use normal npm resolution; installable packages bundle them when required by the pi package boundary.
- `pi.extensions` / `pi.prompts` / `pi.skills` / `pi.themes` manifest entries must remain **real package-relative file paths**. Do not replace them with `exports` aliases.
- Any installable SuPi package that depends on another `@mrclrchtr/supi-*` package must list it in both `dependencies` and `bundledDependencies`. Library-only packages use normal npm resolution. Per [pi packages docs](https://github.com/earendil-works/pi/blob/main/docs/packages.md), pi packages that depend on other pi packages must be bundled in the tarball — npm transitive dependency resolution is not guaranteed by pi's module isolation.
- When a package bundles another `@mrclrchtr/supi-*` package, reference that package's extension in `pi.extensions` via `node_modules/<pkg>/src/extension.ts`. Otherwise, standalone `pi install npm:@mrclrchtr/supi-<name>` won't load the bundled extension — pi only reads the top-level installed package's `pi.extensions`.
- Adding bundled extension references breaks `expectExplicitSurface` in `scripts/__tests__/pack-staged.test.mjs` — use `.toContain`, not `.toEqual`.
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
- Root `skills/` is the skills.sh catalog generated by `supi-skill-patches`. Keep it out of the root `pi.skills` manifest so users select skills through skills.sh.

## Settings registry

Extensions register a `SettingsModule` via `registerSettings()` from `@mrclrchtr/supi-core/settings`. Call it during the factory function. Fixed SuPi config sections use `defineConfigSettings()`; catalog-backed or multi-store modules implement the same interface directly.

- Each module provides asynchronous `read()` and `apply()` operations. The module owns persistence and refresh; the UI owns pending and error presentation.
- `/supi-settings` (from `supi-settings`) renders all registered sections.
- Scope toggle (Tab) switches between project/global; rows show source badges such as `(project)`, `(global)`, and `(default)`.
- Enter opens row actions; Space cycles concrete values; Inherit/Reset actions delete the scoped key. Explicit values are distinct from inherited/default values.

## Shared gotchas

### Event & session semantics
- pi loads these extensions from the working tree directly; after edits, use `/reload` or restart pi.
- `pi.on("tool_result")` can modify tool output after execution; `pi.on("tool_call")` runs before execution — it can mutate input parameters (e.g. inject defaults) or block the call, but cannot add result content.
- Session cleanup event is `session_shutdown`, not `session_end`.
- `session_info_changed` fires when the session display name is set via `/name`, RPC, or `pi.setSessionName()`. Extensions can subscribe to it for reactive title updates.
- `pi.events` EventBus is for extension-to-extension communication; prefer `pi.on()` for pi lifecycle events.
- `createAgentSession()` child sessions do NOT bubble `agent_start`/`agent_end` to parent extension handlers; use `pi.events` to signal activity from programmatic sub-sessions.
- `pi.events.emit("supi:working:start", { source: "supi-<pkg>" })` / `pi.events.emit("supi:working:end", { source: "supi-<pkg>" })` — generic SuPi convention for indicating long-running work across extensions; `tab-spinner` listens to these. Emitters must ensure `end` always fires (success, failure, cancel, timeout).

### UI & rendering
- `ctx.ui.theme` does not expose an `"info"` color; use existing colors like `"accent"` / `"dim"` for info-level UI.
- PI sets the terminal title directly on `this.ui.terminal` during startup and on `/name` renames — it never flows through `ctx.ui.setTitle`. Intercepting `ctx.ui.setTitle` to capture PI's title won't work; recompute dynamically with `pi.getSessionName()` and `ctx.cwd` instead.
- TUI rendering changes (`renderCall`, `renderResult`) require `/reload` — pi loads extensions from the working tree.
- `renderShell: "self"` on `pi.registerTool` strips pi's Box (background, padding) entirely — the tool must provide its own framing. Avoid unless the tool needs full-screen control.
- `code_resolve` target IDs are content-hash based (cwd, file, name, canonical kind, container, declaration line/occurrence, and file fingerprint). The refinable display/name-anchor position is excluded, so anchor refinement reuses the same ID.

### Dependencies & tool behavior
- Pi core peer deps (`@earendil-works/pi-*`, `typebox`) use `"*"` ranges per Pi package docs; do not tighten them.
- `createBashTool` applies `commandPrefix` **before** `spawnHook`; if your hook needs the raw user command, strip the prefix manually and re-apply it to the result.
- Run `pnpm install` before editing `.ts` files when editing dependencies.

### Dev workflow
- `hk` drives local hooks: `pre-commit` autofixes, `pre-push` runs `pnpm verify`.
- `pnpm exec jiti /tmp/script.mjs` — ad-hoc workspace TS runtime probes; Node `--experimental-strip-types` breaks on TS parameter properties here.
- pnpm `ignoredBuiltDependencies` silently skips install scripts; `onlyBuiltDependencies` explicitly allows them — confusing the two causes missing native binaries (e.g. tree-sitter-cli).
- `tsc -b` (build mode) and `--noEmit` are incompatible — use `pnpm typecheck:ai` instead of raw `tsc` commands.
- Per PI docs, signal real tool failures by throwing from `execute()` — returning error text is still a successful tool call. Only throw for actual invalid usage or capability-unavailable conditions, not for valid searches that find zero results.

> For per-package gotchas (session entry parsing, message rendering, config patterns, WASM quirks), see individual `packages/*/CLAUDE.md` files — surfaced by `code_orientation(focus="packages/...")` when the agent orients into that directory.
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

`pack:check` runs this pipeline as a dry-run for all publishable packages. `pack:verify` runs the full pack + tarball verification for all publishable packages via a parallel Node.js runner (`scripts/pack-all.mjs`).

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

## Agent skills

### Issue tracker

GitHub Issues (`gh` CLI). External PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context — `CONTEXT-MAP.md` at root pointing to per-package `CONTEXT.md` files + per-package `docs/adr/`. See `docs/agents/domain.md`.

## Testing patterns

- `vi.hoisted()` callbacks execute before imports — must be inline arrow functions, cannot reference imported values; each test file needs its own top-level `vi.hoisted` + `vi.mock` calls (supports single-value and object patterns, can't share through helpers)
- Biome enforces `noExcessiveLinesPerFunction` (120) and `noExcessiveLinesPerFile` (400, style) on test files too — split large describe blocks into separate test files
- Use `createPiMock()` / `makeCtx()` from `@mrclrchtr/supi-test-utils` for pi mocks instead of defining local factories — includes `events`, `getActiveTools`, `sendMessage`, `registerShortcut`, `exec`, `emit`, and `getAllTools`
- Extension integration tests: mock internal modules, create fake `pi` object capturing handlers via `Map`, then call handlers directly
- Package-scoped commands: `pnpm vitest run packages/<pkg>/`, `pnpm exec biome check packages/<pkg>`, `pnpm exec tsc -b packages/<pkg>/tsconfig.json`. For shared-config changes, sweep `packages/supi-core/ packages/supi-lsp/ packages/supi-claude-md/`.
- Global-scope tests for `defineConfigSettings` should pass `homeDir` in the options object rather than mutating `process.env.HOME`.
- `pnpm exec biome check --write --unsafe <files>` — auto-fix unused imports. `--max-diagnostics=20` caps output when the full check OOMs.
- `ctx.ui.select()` accepts only `string[]`; use label-encoding (e.g. `"[id] name"`) if you need metadata
- `vi.useFakeTimers()` + `vi.advanceTimersByTime(ms)` — required to trigger `setInterval` callbacks in vitest
- Vitest 4.x: constructor mocks inside `vi.mock` factories must use `class` (not `vi.fn().mockImplementation`), hoisting errors propagate from the importing module (check the Caused-by chain), and prefer static `import { x }` over dynamic `await import()` — dynamic imports interact inconsistently with `vi.mock` hoisting
- Shared `createPiMock` stores handlers as `Map<string, handler[]>`; access via `handlers.get(event)?.[0]` — use `getHandlerOrThrow(pi, event)` from `@mrclrchtr/supi-test-utils` to avoid Biome `noNonNullAssertedOptionalChain` (blocks CI)
- `pnpm vitest run` strips types (esbuild) — always run per-package `pnpm exec tsc -b packages/<pkg>/tsconfig.json packages/<pkg>/__tests__/tsconfig.json` alongside.
- Adding exports to `supi-core/index.ts` or deleting source files breaks every downstream `vi.mock` factory — audit all consuming test files for stale mocks after module changes
- **Removing code may leave `// biome-ignore` suppression comments unused** — Biome flags these; remove them
- **Changing state shape requires updating every `createInitialState` mock in test files** — keep mock shapes in sync with real types
- New workspace package: add `package.json` + `tsconfig.json` + `__tests__/tsconfig.json` (`{"extends": "../../../tsconfig.json", "include": ["*.ts"], "exclude": []}`), wire into root `pi.extensions` array, run `pnpm install`
- Module-level `let`/`const` state persists across Vitest tests (ES modules are cached) — use behavioral verification instead of counting constructor invocations
