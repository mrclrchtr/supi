# CLAUDE.md

Pi loads SuPi extensions directly as TypeScript — there is no build step.

## Development status

SuPi is pre-release and not API-stable. Intentional breaking changes to package APIs, commands, configuration formats, and extension behavior are allowed when they improve the design. Do not treat backwards compatibility as a blocker unless a task explicitly asks for it.

## Pi docs-first rule

- Never assume pi harness APIs, behavior, or conventions from memory or model priors.
- Before changing code or giving guidance about pi-specific behavior, read the relevant installed pi docs (`README.md`, matching files in `docs/`, and `examples/`) and follow linked `.md` cross-references.
- Start with `docs/index.md` for getting an overview of PI's docs.
- For Pi context mechanics verified in this repo (request payload, prompt caching, compaction, extension hooks for context control), see `docs/pi/context-architecture.md`.

## Documentation expectations

- `docs/INDEX.md` is the docs index — start there for repo documentation; add new docs per its maintenance rules.
- Documentation describes the Pi version configured in dependencies. Omit version stamps; retain source references.
- Add JSDoc for exported APIs, config surfaces, and non-obvious behavior, including complex internal logic; skip boilerplate for trivial private code.

## Package layout convention

- Follow `docs/conventions/package-layout.md` for new packages and structural work. Use `src/api.ts`, `src/index.ts`, and `src/extension.ts` only when the package role requires them.
- Keep small packages flat; use domain folders rather than catch-all `core/`, `shared/`, or `misc/` buckets when structure is justified.
- Keep tests at package level under `__tests__/unit/`, `__tests__/integration/`, and optional helpers/fixtures.
- Tool packages use per-tool directories under `src/tool/`; follow `docs/conventions/tool-architecture.md` for guidance, specs, execution, results, and rendering boundaries.

## Commands

See `pnpm run` for routine build/lint/test. Toolchain versions pinned in `.mise.toml`.

- When both standard and `*:ai` scripts exist, prefer the `*:ai` variant for agent runs (lower-noise output); use the plain variant only for prettier or interactive local output.
- Run `pnpm verify:ai` (WASM checks, lint, typecheck, skill checks, tests, and tarball verification) for code, test, dependency, or package/config changes; skip it for specs, docs, and skill-only changes unless requested.

## Architecture

The root Pi manifest is the development/local/git install surface; published runtime packages install independently, without a meta-package. Add new installable extensions to root `pi.extensions`; never add library-only packages.

## Packaging conventions

- Every published SuPi pi-package exposes an explicit `./extension` export. Packages with a reusable library API expose an explicit `./api` export (optional — omit when there is no library surface). Do not rely on package-root (`.`) imports or cross-package `src/...` deep imports.
- Library-only packages must not expose `./extension` or `pi.extensions`. Their dependencies use normal npm resolution; installable packages bundle them when required by the pi package boundary.
- `pi.extensions` / `pi.prompts` / `pi.skills` / `pi.themes` manifest entries must remain **real package-relative file paths**. Do not replace them with `exports` aliases.
- Any installable SuPi package that depends on another `@mrclrchtr/supi-*` package must list it in both `dependencies` and `bundledDependencies`. Library-only packages use normal npm resolution. Per [pi packages docs](https://github.com/earendil-works/pi/blob/main/docs/packages.md), pi packages that depend on other pi packages must be bundled in the tarball — npm transitive dependency resolution is not guaranteed by pi's module isolation.
- When a package bundles another extension-bearing `@mrclrchtr/supi-*` package, reference that package's extension in `pi.extensions` via `node_modules/<pkg>/src/extension.ts`. Library-only dependencies have no extension to forward. Otherwise, standalone `pi install npm:@mrclrchtr/supi-<name>` won't load the bundled extension — pi only reads the top-level installed package's `pi.extensions`.
- Child-only adapters such as `supi-agent` and `supi-review` may bundle Code Intelligence solely to pass its headless factory into owned child sessions; they must not load the full parent extension, and `scripts/__tests__/bundled-extension-refs.test.mjs` documents this exception.
- Put runtime dependencies in the publishing package; root-only tooling belongs in `devDependencies`, not root `dependencies`.
- For the publish pipeline (staging, manifest export, npm pack, verification), see the **Publish pipeline** section.

## supi-core entry points

`@mrclrchtr/supi-core` exposes domain subpath exports plus a convenience barrel at `./api`. It is library-only — `/supi-settings` is registered by `@mrclrchtr/supi-settings`.

Prefer domain entry points when importing from supi-core — they only load the dependencies needed for that domain. Use `./api` when you need symbols from 3+ domains.

## Self-registering resources via `resources_discover`

SuPi extensions self-register their prompts, skills, and themes using the `resources_discover` event rather than relying on static `pi.prompts` / `pi.skills` / `pi.themes` in `package.json`. This ensures resources are discovered regardless of whether the package is installed standalone or consumed through the workspace root.

Pattern: derive `baseDir = dirname(dirname(fileURLToPath(import.meta.url)))` and return `{ skillPaths: [join(baseDir, "skills")], promptPaths: [...] }` from a `resources_discover` handler.

`supi-skill-patches` owns upstream synchronization and compatibility patches. Its generated root `skills/` catalog is for skills.sh; `.claude-plugin/marketplace.json` groups the public catalog. Keep the catalog out of root `pi.skills`; selected project-local `.pi/skills/` entries link to it.

## Settings registry

Extensions register a `SettingsModule` via `registerSettings()` from `@mrclrchtr/supi-core/settings`. Call it during the factory function. Fixed SuPi config sections use `defineConfigSettings()`; catalog-backed or multi-store modules implement the same interface directly.

- Each module provides asynchronous `read()` and `apply()` operations. The module owns persistence and refresh; the UI owns pending and error presentation.
- Explicit values are distinct from inherited/default values. Inherit/Reset deletes the scoped key; the UI must preserve that distinction.

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
- `renderShell: "self"` on `pi.registerTool` strips pi's Box (background, padding) entirely — the tool must provide its own framing. Avoid unless the tool needs full-screen control.
- `code_resolve` target IDs are content-hash based (cwd, file, name, canonical kind, container, declaration line/occurrence, and file fingerprint). The refinable display/name-anchor position is excluded, so anchor refinement reuses the same ID.

### Dependencies & tool behavior
- Pi core peer deps (`@earendil-works/pi-*`, `typebox`) use `"*"` ranges per Pi package docs; do not tighten them.
- Import cycles silently corrupt TypeBox tool schemas at module-evaluation time (bindings read `undefined` depending on load order); providers reject the emitted schema with misleading "must have type 'object'" errors — dump the actual wire payload before trusting source schemas. `noImportCycles` is enforced; keep anything a spec imports in leaf modules (`input.ts`, shared constants).
- `createBashTool` applies `commandPrefix` **before** `spawnHook`; if your hook needs the raw user command, strip the prefix manually and re-apply it to the result.
- Run `pnpm install` before editing `.ts` files when editing dependencies.

### Dev workflow
- `hk` pre-commit autofixes with `stash = "none"`; unstaged changes in fixed files may be staged together. No pre-push hook is configured.
- `pnpm exec jiti /tmp/script.mjs` — ad-hoc workspace TS runtime probes; Node `--experimental-strip-types` breaks on TS parameter properties here.
- pnpm `ignoredBuiltDependencies` silently skips install scripts; `onlyBuiltDependencies` explicitly allows them — confusing the two causes missing native binaries (e.g. tree-sitter-cli).
- Use `pnpm typecheck:ai` for project-reference builds; do not substitute ad-hoc `tsc --noEmit` invocations.
- Signal real tool failures by throwing from `execute()`, or return `isError: true` when preserving structured failure data. Error text alone is still success. Valid searches with zero results are not failures.
- `pi -p "Say ok" --model openai-codex/<model> --no-session` — quick repro harness for provider request errors; Codex rides the WebSocket transport under `transport: auto`, set `"transport": "sse"` in `~/.pi/agent/settings.json` to instrument the HTTP path.

> For per-package gotchas (session entry parsing, message rendering, config patterns, WASM quirks), see individual `packages/*/CLAUDE.md` files — surfaced by `code_orientation({ focus: { path: "packages/..." } })` when the agent orients into that directory.
## Publish pipeline

Use the staging pipeline, not direct `pnpm pack`: workspace packing can emit `../` dependency paths. Staging dereferences workspace symlinks, exports npm-compatible manifests (rewrites `workspace:` ranges, strips dev dependencies, preserves bundled dependencies), then runs `npm pack` and validates paths/manifests and extraction.

```bash
node scripts/publish.mjs packages/supi-lsp           # pack + verify
node scripts/publish.mjs packages/supi-lsp --publish # pack + verify + publish
```

`pack:check` and `pack:verify` are aliases for full packing and tarball verification of all publishable packages; neither publishes.

## Release & tagging convention

- Release-please creates one `vX.Y.Z` tag and one GitHub release, not per-package tags.
- Publishable packages listed in `release-please-config.json` `extra-files` share the root version; a breaking change bumps them together. Private `supi-test-utils` and `supi-skill-patches` are outside this version lockstep.
- Release-please owns `.release-please-manifest.json`; do not edit it manually.

## Agent skills

- GitHub Issues (`gh`) are the tracker; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.
- Use the triage vocabulary in `docs/agents/triage-labels.md`.
- `GLOSSARY-MAP.md` links domain contexts and ADRs; follow `docs/agents/domain.md` for domain-model changes.

## Testing patterns

- `vi.hoisted()` callbacks execute before imports — must be inline arrow functions, cannot reference imported values; each test file needs its own top-level `vi.hoisted` + `vi.mock` calls (supports single-value and object patterns, can't share through helpers)
- Biome's function/file line limits are disabled under `__tests__`; production source remains subject to configured limits and explicit overrides.
- Use `createPiMock()` / `makeCtx()` from `@mrclrchtr/supi-test-utils`, not local factories. For extension integration tests, mock internal boundaries and invoke captured handlers directly.
- For shared-config changes, include regression coverage across `supi-core`, `supi-lsp`, and `supi-claude-md`.
- Global-scope tests for `defineConfigSettings` should pass `homeDir` in the options object rather than mutating `process.env.HOME`.
- `pnpm exec biome check --write --unsafe <files>` — auto-fix unused imports. `--max-diagnostics=20` caps output when the full check OOMs.
- `ctx.ui.select()` accepts only `string[]`; use label-encoding (e.g. `"[id] name"`) if you need metadata
- `vi.useFakeTimers()` + `vi.advanceTimersByTime(ms)` — required to trigger `setInterval` callbacks in vitest
- Prefer `class` for constructor mocks inside `vi.mock` factories. Hoisting errors propagate from the importing module (check the Caused-by chain); prefer static imports where dynamic imports interact with mock hoisting.
- Shared `createPiMock` stores handlers as `Map<string, handler[]>`; access via `handlers.get(event)?.[0]` — use `getHandlerOrThrow(pi, event)` from `@mrclrchtr/supi-test-utils` to avoid Biome `noNonNullAssertedOptionalChain` (blocks CI)
- `pnpm vitest run` strips types (esbuild) — always run per-package `pnpm exec tsc -b packages/<pkg>/tsconfig.json packages/<pkg>/__tests__/tsconfig.json` alongside.
- When public exports change, audit downstream mocks for the domain entrypoints consumers actually import; missing mocked exports fail at runtime.
- **Removing code may leave `// biome-ignore` suppression comments unused** — Biome flags these; remove them
- **Changing state shape requires updating every `createInitialState` mock in test files** — keep mock shapes in sync with real types
- New installable extension package: add `package.json` + `tsconfig.json` + `__tests__/tsconfig.json` (`{"extends": "../../../tsconfig.json", "include": ["**/*.ts", "../src/**/*.ts"], "exclude": []}`), wire it into root `pi.extensions`, and run `pnpm install`. Library-only packages use the same package/test configs but must not enter `pi.extensions`.
- Module-level `let`/`const` state persists across Vitest tests (ES modules are cached) — use behavioral verification instead of counting constructor invocations
- Vitest `fsModuleCache` (`node_modules/.vitest-cache`) can serve stale module evaluations during a refactor — delete it when module errors refuse to reproduce
- `noImportCycles` counts `export ... from` re-exports as cycle edges but ignores `import type` — delete dead type re-exports rather than suppress
