# CLAUDE.md

SuPi (**Super Pi**) is an opinionated extension repo for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent) (`@mariozechner/pi-coding-agent`).

It is a pnpm workspace monorepo of installable pi extensions. pi loads the extensions directly as TypeScript — there is no build step.

## Development status

SuPi is pre-release and not API-stable. Intentional breaking changes to package APIs, commands, configuration formats, and extension behavior are allowed when they improve the design. Do not treat backwards compatibility as a blocker unless a task explicitly asks for it.

## Pi docs-first rule

- Never assume pi harness APIs, behavior, or conventions from memory or model priors.
- Before changing code or giving guidance about pi-specific behavior, read the relevant installed pi docs (`README.md`, matching files in `docs/`, and `examples/`) and follow linked `.md` cross-references.
- Treat the pi docs as the source of truth for extensions, skills, prompt templates, TUI, SDK, providers, models, and package behavior.

## Documentation expectations

- Add JSDoc when introducing or changing exported APIs, extension entrypoints, config/settings surfaces, or other non-obvious TypeScript behavior when applicable.
- Add inline JSDoc for complex internal logic when a short explanatory block will make the code easier to maintain.
- Keep JSDoc concise and useful: explain purpose, important parameters/returns, side effects, and pi-specific constraints; skip boilerplate comments for trivial private code.

## Commands

```bash
mise install
pnpm install
mise run hooks
pnpm verify
pnpm typecheck
pnpm typecheck:tests
pnpm biome:ai
pnpm biome:fix && pnpm biome:ai
pnpm exec biome check --write [--unsafe] <files...>
pnpm test
pnpm test:watch
hk run fix
hk run check
pnpm pack:check
```

Toolchain versions are pinned in `.mise.toml`.

## Architecture

This repo has two install surfaces:
- repository root `package.json` exposes a `pi` manifest for local-path and git installs
- `packages/supi/` is the published meta-package bundling the full stack

Current workspace packages:
- `packages/supi-aliases` — `/exit`, `/e`, `/clear` shortcuts
- `packages/supi-core` — shared infrastructure: XML `<extension-context>` tag, config system
- `packages/supi-claude-md` — subdirectory CLAUDE.md injection + root context refresh
- `packages/supi-ask-user` — structured questionnaire UI + `ask_user` tool
- `packages/supi-bash-timeout` — default timeout injection for `bash`
- `packages/supi-lsp` — Language Server Protocol integration + diagnostics guardrails
- `packages/supi-tree-sitter` — Tree-sitter structural analysis tool + reusable parse/query service
- `packages/supi-skill-shortcut` — `$skill-name` shorthand for `/skill:name`
- `packages/supi` — meta-package, prompts, and bundled skills

Other notable areas:
- `openspec/changes/` and `openspec/specs/` — OpenSpec artifacts

## Settings registry

SuPi extensions can register their settings with the shared registry in `supi-core`:

```ts
import { registerSettings } from "@mrclrchtr/supi-core";

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
- `/supi-settings` (registered by `packages/supi/settings.ts`) renders all registered sections
- Scope toggle (Tab) switches between project/global config; values are strings — extensions handle string↔typed conversion
- `loadValues(scope, cwd)` should use raw scope reads (`loadSupiConfigForScope()`), while `loadSupiConfig()` is for merged runtime config
- Submenus use `SettingItem.submenu` returning a pi-tui `Component`; Escape confirms, empty-string done() cancels

## Shared gotchas

- pi loads these extensions from the working tree directly; after edits, use `/reload` or restart pi.
- `pi.on("tool_result")` can modify tool output; `pi.on("tool_call")` can only block.
- Session cleanup event is `session_shutdown`, not `session_end`.
- `ctx.ui.notify()` accepts `"info"` | `"warning"` | `"error"` severity — the gotcha about "info" is for `ctx.ui.theme` colors, not `notify`.
- `ctx.ui.theme` does not expose an `"info"` color; use existing colors like `"accent"` / `"dim"` for info-level UI.
- Keep runtime-imported packages in `peerDependencies`; after changing version ranges run `pnpm install` to refresh the lockfile.
- Pi core peer deps (`@mariozechner/pi-*`, `typebox`) use `"*"` ranges per Pi package docs; do not tighten them.
- Run `pnpm install` before editing `.ts` files when editing dependencies.
- Standalone workspace packages are real install targets; dependency removals often need matching edits in `packages/*/package.json`, not just the root manifest.
- Avoid TS JSON import assertions here; prefer `JSON.parse(fs.readFileSync(..., "utf-8"))`. pi's jiti loader provides `__dirname`.
- `pnpm exec jiti /tmp/script.mjs` — use this for ad-hoc workspace TS runtime probes; Node `--experimental-strip-types` breaks on TS parameter properties here.
- pi flattens tool `promptGuidelines` into the system prompt `Guidelines:` section; each bullet must name its tool explicitly.
- Prefer stable system-prompt guidance via tool `promptGuidelines`; avoid `before_agent_start` `systemPrompt` mutations unless dynamic per-turn guidance is worth the prompt-cache tradeoff.
- `ctx.sessionManager.getBranch()` returns `SessionEntry[]`; reconstruct state from `type === "message"` / `entry.message.role` and `type === "custom_message"`, not flattened branch entries.
- `docs/extensions.md` + `examples/extensions/message-renderer.ts` — authoritative for custom-message rendering; `display: false` suppresses TUI rendering and `content` should hold the visible summary.
- Biome config lives in `biome.jsonc`. For new tests, run `pnpm exec biome check --write <files...>` before verifying.
- `hk` drives local hooks: `pre-commit` autofixes, `pre-push` runs `pnpm verify`.
- OpenSpec `PostHogFetchNetworkError` output is harmless when offline.

## Testing patterns

- `vi.hoisted()` callbacks execute before imports — must be inline arrow functions, cannot reference imported values
- Each test file that mocks modules needs its own top-level `vi.hoisted` + `vi.mock` calls; can't share through helper functions
- Biome enforces `noExcessiveLinesPerFunction` (120) and `noExcessiveLinesPerFile` (400, nursery) on test files too — split large describe blocks into separate test files
- Test helpers can export utilities (`createPiMock`, `makeCtx`, constants) but must not call `vi.mock` or `vi.hoisted` internally
- Extension integration tests: mock internal modules, create fake `pi` object capturing handlers via `Map`, then call handlers directly
- `pnpm vitest run packages/supi-<pkg>/` — run tests for a single package
- Global-scope settings-registry tests can temporarily set `process.env.HOME` to a temp dir; `loadValues(scope, cwd)` has no `homeDir` injection.
- `pnpm vitest run packages/supi-core/ packages/supi-lsp/ packages/supi-claude-md/` — targeted regression sweep for shared config/settings/session-state changes
- `pnpm exec biome check packages/supi-<pkg>` — package-scoped Biome check for faster iteration on one extension
- `pnpm exec tsc --noEmit -p packages/supi-<pkg>/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-<pkg>/__tests__/tsconfig.json` — package-scoped typecheck for one extension and its tests
- `pnpm exec biome check --write --unsafe <files>` — auto-fix unused imports and other unsafe lint issues
