# CLAUDE.md

Pi loads SuPi TypeScript extensions from the working tree; no build step. After edits, `/reload` or restart Pi.

## Development status

SuPi is pre-release and API-unstable. Breaking changes to APIs, commands, config, and extension behavior are allowed when they improve design; require backwards compatibility only when the task explicitly asks.

## Pi docs-first rule

- Before changing or advising on Pi behavior, read the relevant installed Pi docs (`README.md`, `docs/`, `examples/`) and linked `.md` references. Start with installed Pi's `docs/index.md`; never assume APIs or conventions from memory.
- For request payloads, prompt caching, compaction, and context hooks verified here, see `docs/pi/context-architecture.md`.

## Documentation expectations

- Start at `docs/INDEX.md` for repo docs; follow its maintenance rules when adding docs.
- Docs target the Pi version declared in dependencies; omit version stamps, retain source references.
- Add JSDoc for exported APIs, config surfaces, and non-obvious behavior (including complex internals), not trivial private code.

## Package layout convention

- For new packages or structural work, follow `docs/conventions/package-layout.md` for role-specific boundaries, layout, and source/test configs.
- For tool packages, follow `docs/conventions/tool-architecture.md` for per-tool guidance, specs, execution, results, and rendering boundaries.

## Commands

- Prefer lower-noise `*:ai` scripts when available; plain variants are for prettier/interactive output.
- Choose validation by impact, not file type. Use the smallest checks that cover the change and its affected consumers.
- For localized code/test changes, run focused tests and affected package typechecks. For docs/specs/skills or automation-policy-only changes (e.g. Renovate grouping), use relevant content, syntax, or config validation instead of `pnpm verify:ai`.
- Run `pnpm verify:ai` for workspace-wide impact: shared APIs or cross-package behavior, dependency/lockfile updates, packaging/publishing, or shared build/test configuration. Also run it when impact cannot be safely bounded or the user requests it.
- Report checks run, failures, and validation skipped.

## Architecture

The root Pi manifest serves development/local/git installs; published runtime packages install independently, without a meta-package. Add installable extensions to root `pi.extensions`, never library-only packages.

## Packaging conventions

- Published pi-packages export `./extension`; reusable APIs export `./api` (omit when absent). Use explicit subpaths, not package-root (`.`) or cross-package `src/...` imports.
- Library-only packages expose neither `./extension` nor `pi.extensions` and use normal npm dependency resolution.
- `pi.extensions` / `pi.prompts` / `pi.skills` / `pi.themes` entries must be **real package-relative paths**, not `exports` aliases.
- Installable packages list every `@mrclrchtr/supi-*` dependency in both `dependencies` and `bundledDependencies`: [Pi module isolation](https://github.com/earendil-works/pi/blob/main/docs/packages.md) makes transitive npm resolution unreliable.
- Forward bundled extension-bearing packages through `pi.extensions` via `node_modules/<pkg>/src/extension.ts`. Standalone installs load only the top-level package's extension manifest; library-only dependencies have no extension to forward.
- Child-only adapters (`supi-agent`, `supi-review`) may bundle Code Intelligence only to pass its headless factory to owned child sessions; never load the full parent extension. See `scripts/__tests__/bundled-extension-refs.test.mjs` for this exception.
- Runtime dependencies belong in the publishing package; root-only tooling belongs in root `devDependencies`, not `dependencies`.
- For packing/publishing, see **Publish pipeline** below.

## supi-core entry points

`@mrclrchtr/supi-core` is library-only; `/supi-settings` belongs to `@mrclrchtr/supi-settings`. Prefer domain subpath exports to load only needed dependencies; use `./api` for symbols from 3+ domains.

## Self-registering resources via `resources_discover`

Register prompts, skills, and themes through `resources_discover`, not static `pi.prompts` / `pi.skills` / `pi.themes`, so discovery works standalone and through the workspace root.

Derive `baseDir = dirname(dirname(fileURLToPath(import.meta.url)))`; return `{ skillPaths: [join(baseDir, "skills")], promptPaths: [...] }` from the handler.

`supi-skill-patches` owns upstream sync and compatibility patches. Its generated root `skills/` catalog serves skills.sh; `.claude-plugin/marketplace.json` groups the public catalog. Keep it out of root `pi.skills`; selected `.pi/skills/` entries link to it.

## Settings registry

Register a `SettingsModule` with `registerSettings()` from `@mrclrchtr/supi-core/settings` during the extension factory. Use `defineConfigSettings()` for fixed config sections; catalog-backed/multi-store modules implement the interface directly.

- Modules provide async `read()` and `apply()` and own persistence/refresh; the UI owns pending/error presentation.
- Preserve explicit versus inherited/default values: Inherit/Reset deletes the scoped key.

## Shared gotchas

### Event & session semantics
- `pi.on("tool_result")` can modify output after execution; `pi.on("tool_call")` can mutate input or block execution, not add result content.
- Use `session_shutdown` for cleanup, not `session_end`.
- `session_info_changed` fires on display-name changes via `/name`, RPC, or `pi.setSessionName()`; use it for reactive titles.
- Use `pi.events` for extension-to-extension communication; prefer `pi.on()` for Pi lifecycle events.
- `createAgentSession()` children do not bubble `agent_start`/`agent_end` to parent handlers; signal activity through `pi.events`.
- Emit `supi:working:start` / `supi:working:end` via `pi.events.emit(name, { source: "supi-<pkg>" })` for long-running work; `tab-spinner` listens. Always emit `end`, including on failure, cancel, and timeout.

### UI & rendering
- `ctx.ui.theme` has no `"info"` color; use `"accent"` / `"dim"` for info-level UI.
- Pi sets titles on `this.ui.terminal` at startup and `/name`, bypassing `ctx.ui.setTitle`. Recompute with `pi.getSessionName()` and `ctx.cwd` instead of intercepting `setTitle`.
- `renderShell: "self"` on `pi.registerTool` removes Pi's Box (background/padding); provide framing yourself. Reserve for full-screen control.
- `ctx.ui.select()` accepts only `string[]`; encode metadata in labels (e.g. `"[id] name"`).
- `code_resolve` IDs hash cwd, file, name, canonical kind, container, declaration line/occurrence, and file fingerprint. Display/name-anchor position is excluded, so anchor refinement preserves IDs.

### Dependencies & tool behavior
- Pi core peers (`@earendil-works/pi-*`, `typebox`) use `"*"` ranges per Pi package docs; do not tighten them.
- Import cycles can corrupt TypeBox schemas at module evaluation (`undefined` bindings), producing misleading "must have type 'object'" errors. Inspect the wire payload. `noImportCycles` is enforced; keep spec imports in leaf modules (`input.ts`, shared constants).
- `createBashTool` applies `commandPrefix` **before** `spawnHook`; hooks needing raw commands must strip the prefix and reapply it to the result.
- For dependency changes, run `pnpm install` before editing `.ts` files.

### Dev workflow
- `hk` pre-commit autofixes with `stash = "none"`; unstaged changes in fixed files may be staged too. No pre-push hook.
- Use `pnpm exec jiti /tmp/script.mjs` for TS runtime probes; Node `--experimental-strip-types` breaks on TS parameter properties here.
- Dependency install scripts use `allowBuilds` in `pnpm-workspace.yaml` (`true` allows, `false` skips); keep `tree-sitter-cli` enabled so its native binary is installed.
- Use `pnpm typecheck:ai` for project-reference builds, not ad-hoc `tsc --noEmit`.
- Report tool failures by throwing from `execute()` or returning `isError: true` with structured failure data. Error text alone is success; valid zero-result searches are not failures.
- Reproduce provider errors with `pi -p "Say ok" --model openai-codex/<model> --no-session`. Codex uses WebSockets under `transport: auto`; set `"transport": "sse"` in `~/.pi/agent/settings.json` to instrument HTTP.

> For package-specific session parsing, rendering, config, and WASM gotchas, read `packages/*/CLAUDE.md`, surfaced by `code_orientation({ focus: { path: "packages/..." } })`.

## Publish pipeline

Use staging, not direct `pnpm pack` (which can emit `../` dependencies). Staging dereferences workspace symlinks, exports npm-compatible manifests (rewrites `workspace:`, strips dev dependencies, preserves bundles), runs `npm pack`, and validates paths/manifests and extraction.

```bash
node scripts/publish.mjs packages/supi-lsp           # pack + verify
node scripts/publish.mjs packages/supi-lsp --publish # pack + verify + publish
```

## Release & tagging convention

- Release-please creates one `vX.Y.Z` tag and GitHub release, not per-package tags.
- Packages in `release-please-config.json` `extra-files` share the root version and breaking-change bumps. Private `supi-test-utils` and `supi-skill-patches` are outside lockstep.
- Release-please owns `.release-please-manifest.json`; never edit it manually.

## Agent skills

- GitHub Issues (`gh`) are the tracker; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.
- Use triage vocabulary from `docs/agents/triage-labels.md`.
- For domain-model changes, follow `docs/agents/domain.md`; `GLOSSARY-MAP.md` links domain contexts and ADRs.

## Testing patterns

- When adding, changing, reviewing, or removing tests, follow [the testing convention](docs/conventions/testing.md) for test admission, coverage value, and the review checkpoint.
- Keep `vi.mock()` declarations at test-file top level. Use `vi.hoisted()` when mock factories need shared setup; its callback runs before imports and cannot use imported runtime values.
- Use `createPiMock()` / `makeCtx()` from `@mrclrchtr/supi-test-utils`, not local factories. For extension integration tests, isolate collaborators at stable boundaries and invoke captured handlers directly; keep the behavior under test real.
- Shared-config changes need regression coverage across `supi-core`, `supi-lsp`, and `supi-claude-md`.
- For global `defineConfigSettings` tests, pass `homeDir` in options rather than changing `process.env.HOME`.
- Auto-fix unused imports with `pnpm exec biome check --write --unsafe <files>`; cap output with `--max-diagnostics=20` if the full check OOMs.
- Prefer `class` for constructor mocks in `vi.mock`. Check hoisting errors' Caused-by chain; prefer static imports when dynamic imports interact with hoisting.
- `createPiMock` stores handlers as `Map<string, handler[]>` (`handlers.get(event)?.[0]`); use `getHandlerOrThrow(pi, event)` from `@mrclrchtr/supi-test-utils` to avoid CI-blocking `noNonNullAssertedOptionalChain`.
- Vitest/esbuild strips types. Alongside `pnpm vitest run`, run `pnpm exec tsc -b packages/<pkg>/tsconfig.json packages/<pkg>/__tests__/tsconfig.json`.
- When public exports change, audit downstream mocks for consumers' actual domain entrypoints; missing exports fail at runtime.
- State-shape changes require updating **every** `createInitialState` mock to match real types.
- After adding a package, run `pnpm install` to refresh workspace links.
- Module-level state persists across Vitest tests (cached ES modules); verify behavior rather than constructor counts.
- Vitest `fsModuleCache` (`node_modules/.vitest-cache`) can retain stale evaluations during refactors; delete it when module errors won't reproduce.
- `noImportCycles` counts `export ... from` re-exports, not `import type`; delete dead type re-exports rather than suppressing.
