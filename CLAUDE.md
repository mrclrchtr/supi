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

- Add JSDoc when introducing or changing exported APIs, extension entrypoints, config/settings surfaces, or other non-obvious TypeScript behavior when applicable.
- Add inline JSDoc for complex internal logic when a short explanatory block will make the code easier to maintain.
- Keep JSDoc concise and useful: explain purpose, important parameters/returns, side effects, and pi-specific constraints; skip boilerplate comments for trivial private code.

## Commands

```bash
pnpm verify
pnpm typecheck[:tests]
pnpm biome<:ai/:fix>
pnpm test
pnpm pack:check
pnpm pack:verify  # real tarball verification for packages with bundledDependencies
```

Toolchain versions are pinned in `.mise.toml`.

## Architecture

This repo has two install surfaces:
- repository root `package.json` exposes a `pi` manifest for local-path and git installs — supports `extensions`, `prompts`, `skills`, `themes` keys
- `packages/supi/` is the published meta-package bundling the full stack

A compact workspace overview is auto-injected on the first agent turn by `supi-code-intelligence` (`before_agent_start` → `generateOverview()`). The package list below highlights the modules most often touched in agent sessions; inspect `packages/` for the complete workspace inventory.

Highlighted workspace packages:
- `packages/supi` — meta-package with explicit `src/api.ts` + aggregated `src/extension.ts`
- `packages/supi-ask-user` — structured questionnaire UI + `ask_user` tool
- `packages/supi-bash-timeout` — default timeout injection for `bash`
- `packages/supi-claude-md` — subdirectory CLAUDE.md injection
- `packages/supi-core` — shared infrastructure: XML `<extension-context>` tag, config system
- `packages/supi-extras` — command aliases, skill shorthand, tab spinner, prompt stash
- `packages/supi-lsp` — Language Server Protocol integration + diagnostics guardrails
- `packages/supi-tree-sitter` — Tree-sitter structural analysis tool + reusable parse/query service
- `packages/supi-web` — fetch web pages as clean Markdown via the `web_fetch_md` tool

## Package tiers

- **Production** — stable, bundled in `@mrclrchtr/supi` (`supi-core`, `supi-ask-user`, `supi-bash-timeout`, `supi-claude-md`, `supi-extras`, `supi-lsp`, `supi-tree-sitter`, `supi-code-intelligence`, `supi-debug`, `supi-context`)
- **Beta** — experimental/niche, direct-install only (`supi-cache`, `supi-insights`, `supi-review`, `supi-rtk`, `supi-web`)

**Promote to Production:** add to `dependencies`, `bundledDependencies`, and the aggregated `packages/supi/src/extension.ts` + `packages/supi/src/api.ts` surfaces, update `package.json` `pi.extensions` if needed, update lists above, `pnpm install`.

**Demote to Beta:** remove from `dependencies`, `bundledDependencies`, `pi.extensions`, delete `src/<name>.ts`, prune unused external deps, update lists, `pnpm install`.

## Packaging conventions

- Every published SuPi package exposes explicit `./api` and `./extension` exports. Do not rely on package-root (`.`) imports or cross-package `src/...` deep imports.
- `pi.extensions` / `pi.prompts` / `pi.skills` / `pi.themes` manifest entries must remain **real package-relative file paths**. Do not replace them with `exports` aliases.
- The published meta-package `@mrclrchtr/supi` bundles all Production sub-packages via `bundledDependencies`. Per [pi packages docs](https://github.com/earendil-works/pi/blob/main/docs/packages.md), pi packages that depend on other pi packages must be bundled in the tarball — npm transitive dependency resolution is not guaranteed by pi's module isolation.
- Any SuPi package that depends on another `@mrclrchtr/supi-*` package must list it in both `dependencies` and `bundledDependencies`.
- Root `package.json` is `"private": true` — runtime dependencies belong in sub-packages or in root `devDependencies`, not in root `dependencies`.
- For the publish pipeline (staging, manifest export, npm pack, verification), see the **Publish pipeline** section.

## Self-registering resources via `resources_discover`

SuPi extensions self-register their prompts, skills, and themes using the `resources_discover` event rather than relying on static `pi.prompts` / `pi.skills` / `pi.themes` in `package.json`. This ensures resources are discovered regardless of whether the package is installed standalone or consumed through the meta-package (`@mrclrchtr/supi`).

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

SuPi extensions can register their settings with the shared registry in `supi-core`:

```ts
import { registerSettings } from "@mrclrchtr/supi-core/api";

registerSettings({
  id: "my-ext",
  label: "My Extension",
  loadValues: (scope, cwd) => [
    { id: "enabled", label: "Enable", currentValue: "on", values: ["on", "off"] },
  ],
  persistChange: (scope, cwd, settingId, value) => {
    // Write to ~/.pi/agent/supi/config.json (global) or .pi/supi/config.json (project)
  },
});
```

- Call `registerSettings()` during the extension factory function (not in async handlers)
- The registry stores `SettingItem[]` compatible with pi-tui's `SettingsList`
- `/supi-settings` (registered by `packages/supi-core/src/extension.ts`, or indirectly by the meta-package aggregated extension) renders all registered sections
- Scope toggle (Tab) switches between project/global config; values are strings — extensions handle string↔typed conversion
- `loadValues(scope, cwd)` should use raw scope reads (`loadSupiConfigForScope()`), while `loadSupiConfig()` is for merged runtime config
- For config-backed sections, prefer `registerConfigSettings()` in `supi-core` over manual `registerSettings()` + `loadSupiConfigForScope()` + `writeSupiConfig()` wiring
- Submenus use `SettingItem.submenu` returning a pi-tui `Component`; Escape confirms, empty-string done() cancels

## Shared gotchas

- pi loads these extensions from the working tree directly; after edits, use `/reload` or restart pi.
- `pi.on("tool_result")` can modify tool output after execution; `pi.on("tool_call")` runs before execution — it can mutate input parameters (e.g. inject defaults) or block the call, but cannot add result content.
- Session cleanup event is `session_shutdown`, not `session_end`.
- `ctx.ui.notify()` accepts `"info"` | `"warning"` | `"error"` severity — the gotcha about "info" is for `ctx.ui.theme` colors, not `notify`.
- `ctx.ui.theme` does not expose an `"info"` color; use existing colors like `"accent"` / `"dim"` for info-level UI.
- PI sets the terminal title directly on `this.ui.terminal` during startup and on `/name` renames — it never flows through `ctx.ui.setTitle`. Intercepting `ctx.ui.setTitle` to capture PI's title won't work; recompute dynamically with `pi.getSessionName()` and `ctx.cwd` instead.
- PI internal events like `session_info_changed` are consumed by the interactive mode only; they are **not** forwarded to extension handlers via `pi.on()`. The `pi.events` EventBus is strictly for extension-to-extension communication.
- `createAgentSession()` child sessions do NOT bubble `agent_start`/`agent_end` to parent extension handlers; use `pi.events` to signal activity from programmatic sub-sessions.
- `pi.events.emit("supi:working:start", { source: "supi-<pkg>" })` / `pi.events.emit("supi:working:end", { source: "supi-<pkg>" })` — generic SuPi convention for indicating long-running work across extensions; `tab-spinner` listens to these. Emitters must ensure `end` always fires (success, failure, cancel, timeout).
- Pi core peer deps (`@earendil-works/pi-*`, `typebox`) use `"*"` ranges per Pi package docs; do not tighten them.
- Mark pi-provided peer deps (`@earendil-works/pi-*`, `typebox`) as optional via `peerDependenciesMeta` to prevent `npm install -g` from auto-installing them (which can pull in native addons like koffi that fail on newer Node.js versions).
- Other runtime imports belong in `dependencies`, not `peerDependencies`.
- External runtime deps belong to the standalone package that imports them. The meta-package is assembled from packed standalone tarballs, so avoid re-declaring third-party runtime deps in `packages/supi` unless the meta-package imports them directly.
- `createBashTool` applies `commandPrefix` **before** `spawnHook`; if your hook needs the raw user command, strip the prefix manually and re-apply it to the result.
- Run `pnpm install` before editing `.ts` files when editing dependencies.
- Standalone workspace packages are real install targets; dependency removals often need matching edits in `packages/*/package.json`, not just the root manifest.
- Pi discovers package skills from `node_modules` scanning, not workspace packages' `package.json`. Workspace skills must be registered explicitly — SuPi uses `resources_discover` for this (see documentation section above).
- Packages that only contribute settings sections should document `/supi-settings` as conditional on the install surface, not as a standalone command they ship.
- Avoid TS JSON import assertions here; prefer `JSON.parse(fs.readFileSync(..., "utf-8"))`. pi's jiti loader provides `__dirname`.
- `pnpm exec jiti /tmp/script.mjs` — use this for ad-hoc workspace TS runtime probes; Node `--experimental-strip-types` breaks on TS parameter properties here.
- pi flattens tool `promptGuidelines` into the system prompt `Guidelines:` section; each bullet must name its tool explicitly.
- Prefer stable system-prompt guidance via tool `promptGuidelines`; avoid `before_agent_start` `systemPrompt` mutations unless dynamic per-turn guidance is worth the prompt-cache tradeoff.
- `ctx.sessionManager.getBranch()` returns `SessionEntry[]`; reconstruct state from `type === "message"` / `entry.message.role` and `type === "custom_message"`, not flattened branch entries.
- `parseSessionEntries()` returns raw entries; call `migrateSessionEntries(entries)` afterward to handle legacy v1/v2 session files that lack `id`/`parentId`.
- Session files are append-only trees. The active branch is the path from the **last entry** (current leaf) back to root via `parentId` — do not count every entry in the file.
- Cache keys for session-derived data should include `sessionId + filePath hash + modified timestamp` to handle branch deduplication and stale-cache invalidation.
- `docs/extensions.md` + `examples/extensions/message-renderer.ts` — authoritative for custom-message rendering; `display: false` suppresses TUI rendering and `content` should hold the visible summary.
- `pi.registerMessageRenderer(customType, renderer)` — `message.content` is what the LLM sees in conversation context; `message.details` is renderer-only data. Pass structured events in `details` and plain text in `content` so agents see JSON while users see styled, themed output.
- Custom `registerMessageRenderer` handlers must explicitly display `warning` for all result states (including `success` and `canceled`), not just `failed`/`timeout`.
- Biome config lives in `biome.jsonc`. For new tests, run `pnpm exec biome check --write <files...>` before verifying.
- Biome's import organizer sorts `export type { X }` before `export { Y }` from the same module — use `--write` to apply the canonical order automatically
- `hk` drives local hooks: `pre-commit` autofixes, `pre-push` runs `pnpm verify`.
- OpenSpec `PostHogFetchNetworkError` output is harmless when offline.
- `npm pack <pkg>@<ver> --silent && tar -tzf` — inspect actual npm tarball contents; `npm view` only shows registry metadata which may not match shipped files
## Publish pipeline

Published npm tarballs must produce npm-compatible manifests because PI installs packages via `npm install`. The pipeline has four stages:

1. **Standalone staging** — `scripts/pack-staged.mjs` copies a workspace package into a clean staging directory. For ordinary packages this still dereferences workspace symlinks; for `packages/supi` it stages only the meta-package's own files.
2. **Manifest export** — `scripts/staged-manifests.mjs` uses pnpm's `@pnpm/exportable-manifest` to rewrite staged workspace `package.json` files: `workspace:*` → exact version (`1.5.0`), `workspace:~` → `~1.5.0`, `workspace:^` → `^1.5.0`. It also strips `devDependencies` from publish manifests so private workspace-only test utilities never leak, and preserves `bundledDependencies`.
3. **Meta-package assembly from real artifacts** — `packages/supi` is assembled from already-packed standalone Production tarballs extracted into `node_modules/`. This makes standalone tarballs the source of truth instead of raw workspace layout.
4. **npm pack + tarball verification** — The cleaned staged directory is packed with `npm pack`, then `scripts/verify-tarball.mjs` rejects `../` paths and `workspace:` protocol in every packed `package.json` and checks extraction succeeds.

Run:
```bash
node scripts/publish.mjs packages/supi-lsp     # pack + verify
node scripts/publish.mjs packages/supi --publish  # pack + verify + publish
```

The `pack:check` and `pack:verify` commands in `pnpm verify` run this pipeline for all publishable packages.

Root cause for the staging pipeline: direct `pnpm pack` on the meta-package (`packages/supi`) produces tarball entries with `../` paths to the root `node_modules`. The staged `cp -RL` + `npm pack` approach avoids this because npm produces correct bundled tarballs from a flat, dereferenced `node_modules`.
- pnpm `ignoredBuiltDependencies` silently skips install scripts; `onlyBuiltDependencies` explicitly allows them — confusing the two causes missing native binaries (e.g. tree-sitter-cli)
- RTK fallback warnings (`rtk/fallback: non-zero-exit`) are rewrite-attempt noise, not actual failures — the bash command usually succeeds afterward

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
- `pnpm vitest run packages/supi-<pkg>/` — run tests for a single package
- Global-scope tests for `registerConfigSettings` should pass `homeDir` in the options object rather than mutating `process.env.HOME`.
- `pnpm vitest run packages/supi-core/ packages/supi-lsp/ packages/supi-claude-md/` — targeted regression sweep for shared config/settings/session-state changes
- `pnpm exec biome check packages/supi-<pkg>` — package-scoped Biome check for faster iteration on one extension
- `pnpm exec tsc --noEmit -p packages/supi-<pkg>/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-<pkg>/__tests__/tsconfig.json` — package-scoped typecheck for one extension and its tests
- `pnpm exec biome check --write --unsafe <files>` — auto-fix unused imports and other unsafe lint issues
- `pnpm exec biome check --max-diagnostics=20 <files>` — when the full workspace check OOMs, cap diagnostics
- `ctx.ui.select()` accepts only `string[]`; use label-encoding (e.g. `"[id] name"`) if you need metadata
- `vi.useFakeTimers()` + `vi.advanceTimersByTime(ms)` — required to trigger `setInterval` callbacks in vitest
- In Vitest 4.x, constructor mocks inside `vi.mock` factories must use `class` — `vi.fn().mockImplementation(() => ({}))` silently returns `this` instead of the object
- `vi.mock` hoisting errors propagate from the importing module (e.g. `runner.ts:2:1`), not the test file's `vi.mock` call site — check the Caused-by chain
- Shared `createPiMock` stores handlers as `Map<string, handler[]>` — access as `handlers.get(event)?.[0]`, not `handlers.get(event)!`
- `pi.handlers.get("event")?.[0]!` triggers Biome `noNonNullAssertedOptionalChain` (blocks CI); use `getHandlerOrThrow(pi, event)` from `@mrclrchtr/supi-test-utils` instead
- `pnpm vitest run` does not check types (esbuild strips them) — run `pnpm typecheck:tests` (or per-package `pnpm exec tsc --noEmit -p packages/<pkg>/__tests__/tsconfig.json`) alongside test runs to catch type errors
- Adding a new runtime export to `supi-core/index.ts` breaks every downstream `vi.mock("@mrclrchtr/supi-core")` factory that omits it; audit all `vi.mock` blocks in consuming packages
- The same applies to new runtime exports from local modules (e.g., `CLAUDE_MD_DEFAULTS` from `config.ts`) consumed by `vi.mock("../config.ts")` factories
- **Deleting a source file breaks every test with `vi.mock("../<file>")` referencing it** — audit all test files for stale mock factories after module deletion
- **Removing code may leave `// biome-ignore` suppression comments unused** — Biome flags these; remove them
- **Changing state shape requires updating every `createInitialState` mock in test files** — keep mock shapes in sync with real types
- New workspace package: add `package.json` + `tsconfig.json` + `__tests__/tsconfig.json`, wire into root `pi.extensions` array, run `pnpm install`
- Package-scoped test tsconfig: `{"extends": "../../../tsconfig.json", "include": ["*.ts"], "exclude": []}`
- Module-level `let`/`const` state (e.g., lazy-init singleton client) persists across Vitest tests because ES modules are cached — use behavioral verification (what the function returns or calls) instead of counting constructor invocations
- Prefer `import { x } from "../src/module.ts"` over `const { x } = await import("../src/module.ts")` in test files — dynamic imports interact inconsistently with `vi.mock` hoisting in some Vitest 4.x edge cases
