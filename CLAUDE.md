# CLAUDE.md

SuPi (**Super Pi**) is an opinionated extension repo for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent) (`@mariozechner/pi-coding-agent`).

It is a pnpm workspace monorepo of installable pi extensions. pi loads the extensions directly as TypeScript — there is no build step.

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
- Submenus use `SettingItem.submenu` returning a pi-tui `Component`; Escape confirms, empty-string done() cancels

## Shared gotchas

- pi loads these extensions from the working tree directly; after edits, use `/reload` or restart pi.
- `pi.on("tool_result")` can modify tool output; `pi.on("tool_call")` can only block.
- Session cleanup event is `session_shutdown`, not `session_end`.
- `ctx.ui.notify()` accepts `"info"` | `"warning"` | `"error"` severity — the gotcha about "info" is for `ctx.ui.theme` colors, not `notify`.
- `ctx.ui.theme` does not expose an `"info"` color; use existing colors like `"accent"` / `"dim"` for info-level UI.
- Keep runtime-imported packages in `peerDependencies`; after changing version ranges run `pnpm install` to refresh the lockfile.
- Run `pnpm install` before editing `.ts` files when editing dependencies.
- Standalone workspace packages are real install targets; dependency removals often need matching edits in `packages/*/package.json`, not just the root manifest.
- Avoid TS JSON import assertions here; prefer `JSON.parse(fs.readFileSync(..., "utf-8"))`. pi's jiti loader provides `__dirname`.
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
- `pnpm exec biome check --write --unsafe <files>` — auto-fix unused imports and other unsafe lint issues
