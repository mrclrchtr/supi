# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

SuPi (**Super Pi**) is an opinionated extension repo for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent) (`@mariozechner/pi-coding-agent`).

**Slogan:** *The opinionated way to extend PI.*

It is my curated extension stack for PI, with LSP, Skills, marketplace compatibility, and personal best practices built in. Extensions are loaded directly as TypeScript by pi — there is no build step.

Extensions sourced from [joelhooks/pi-tools](https://github.com/joelhooks/pi-tools).

Install into pi:
```bash
# Full stack
pi install /path/to/SuPi
pi install git:github.com/mrclrchtr/supi

# Individual extensions from local checkout
pi install /path/to/SuPi/packages/supi-lsp
pi install /path/to/SuPi/packages/supi-ask-user
```

## Commands

```bash
# Install pinned local tools
mise install

# Install dependencies
pnpm install

# Install repo git hooks
mise run hooks

# Full verification suite (runs on pre-push)
pnpm verify

# Type-check all extensions (no emit)
pnpm typecheck

# Type-check test files only (faster than full typecheck)
pnpm typecheck:tests

# Lint/format check (AI-friendly output)
pnpm biome:ai

# Auto-fix lint/format issues, then verify
pnpm biome:fix && pnpm biome:ai

# Fix formatting/imports on only the files you touched
pnpm exec biome check --write <files...>

# Scannable biome error list (one line per issue)
pnpm biome:ci --colors=off 2>&1 | grep '\.ts:'

# Run all tests (unit + integration)
pnpm test

# Fast smoke test for LSP guidance/relevance changes
pnpm exec vitest run packages/supi-lsp/__tests__/guidance.test.ts

# Fast smoke test for ask-user changes
pnpm exec vitest run packages/supi-ask-user/__tests__/guidance.test.ts

# Install repo hook scripts into .git/hooks
mise run hooks

# Run the pre-push hook suite locally (full pnpm verify)
hk run check

# Run the pre-commit autofix suite locally
hk run fix

# Watch mode
pnpm test:watch

# Dry-run npm pack (meta-package only)
pnpm pack:check

# Releases are automated via release-please — no local command needed
```

Toolchain versions are managed via [mise](https://mise.jdx.dev) in `.mise.toml`
(`node = "lts"`, `pnpm = "latest"`, `hk = "1.42.0"`, `pkl = "0.31.1"`).

Tooling config at repo root: `hk.pkl`, `commitlint.config.mjs`, `release-please-config.json`, `.release-please-manifest.json`, `vitest.workspace.ts` (no `.github` shims).

## Architecture

This is a pnpm workspace monorepo. Each extension is an independently installable package under `packages/supi-*/`. The `packages/supi/` meta-package bundles the full stack, and the repository root also exposes a `pi` manifest so `pi install /path/to/SuPi` and `pi install git:github.com/mrclrchtr/supi` continue to work.

Extension packages are registered in their own `package.json` under `pi.extensions`. The meta-package re-exports them through local wrapper `.ts` entrypoints in `packages/supi/`, while the repository root points at `packages/*` source files for git and local-path installs. Prompt templates and skills live in `packages/supi/prompts/` and `packages/supi/skills/`.

```json
// packages/supi-aliases/package.json
"pi": {
  "extensions": ["./aliases.ts"]
}
```

### Prompt templates

Templates live in `prompts/*.md` and are invoked with `/name` in the pi editor. Only `description:` is valid frontmatter — `allowed-tools` and other Claude-specific keys are silently ignored.

Current templates: `revise-claude-md.md` (invoked with `/revise-claude-md`).

### Skills

Skills live in `skills/<name>/SKILL.md`. Registered via `pi.skills: ["./skills"]` in `package.json`. Naming rules (violations silently skip loading): lowercase + hyphens only, ≤ 64 chars, must match parent directory name, no leading/trailing/consecutive hyphens, `description:` frontmatter is required. Progressive disclosure: `description` always in context → `SKILL.md` loads on invocation → `references/*.md` loads on demand. Keep `SKILL.md` as opinionated guide + read-pointers; put copy-paste code in `references/`.

### Extension shape

Every extension is a default-exported function that receives the `ExtensionAPI`:

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // register commands, event hooks, etc.
}
```

### Key API surface

- `pi.registerCommand(name, { description, handler })` — adds a `/name` slash command
- `pi.on("session_start", (event, ctx) => …)` — fires when a session begins
- `pi.on("tool_call", async (event) => …)` — intercepts LLM tool calls; mutate `event.input` to override parameters
- `pi.on("input", (event) => …)` — intercepts user input before agent processing; return `{ action: "transform", text }` to rewrite it or `{ action: "continue" }` to pass through
- `pi.on("before_agent_start", (event) => …)` — inject per-turn steering/context; use `message.display = false` for hidden guidance
- `pi.getCommands()` — returns all registered commands; `c.source === "skill"` identifies skill commands
- `ctx.shutdown()` — exits the session
- `ctx.ui.setWidget(id, lines)` — shows/clears a persistent UI widget
- `ctx.ui.notify(message, level)` — one-shot notification
- `ctx.ui.setEditorComponent(factory)` — replaces the prompt editor component
- `pi.registerTool({ name, label, description, parameters, execute })` — registers a custom tool; `parameters` uses `Type.Object()` from `@sinclair/typebox`; `execute(toolCallId, params, signal, onUpdate, ctx)` returns `{ content, details }`
- `pi.on("tool_result", async (event, ctx) => …)` — runs after tool execution; return `{ content }` to patch result
- `pi.on("session_shutdown", async () => …)` — fires before session teardown; clean up subprocesses here

### LSP extension

Provides Language Server Protocol integration — type-aware hover, go-to-definition, find-references, diagnostics, rename, code-actions, and document-symbols via a registered `lsp` tool. Intercepts `write`/`edit` to surface blocking diagnostics inline. The tool advertises semantic-first guidance via `promptSnippet`/`promptGuidelines` as always-on discoverability. Runtime pre-turn guidance in `before_agent_start` is stateful and dormant by default: it activates only after qualifying source interactions (`read`, `edit`, `write`, `lsp` on a supported file type) and re-injects only when the activation hint is pending or tracked-file diagnostics change.

Files: `packages/supi-lsp/lsp.ts` (entry), `packages/supi-lsp/client.ts` (LSP client lifecycle), `packages/supi-lsp/transport.ts` (JSON-RPC), `packages/supi-lsp/config.ts` (server config), `packages/supi-lsp/manager.ts` (server pool), `packages/supi-lsp/runtime-state.ts` (runtime guidance state), `packages/supi-lsp/guidance.ts` (message formatting), `packages/supi-lsp/tool-actions.ts` (tool dispatch), `packages/supi-lsp/diagnostics.ts` (formatting), `packages/supi-lsp/utils.ts` (URI/language/path utils), `packages/supi-lsp/types.ts` (LSP types), `packages/supi-lsp/defaults.json` (server definitions).

Commands: `/lsp-status` — shows active servers, open files, and diagnostics summary.

Per-project config: `.pi-lsp.json` in project root to override/add/disable servers. YAML is not supported (no YAML parser dependency).

### Ask-user extension

Rich questionnaire UI (`ask_user` tool) for structured agent–user decisions. Supports explicit `choice`, `multichoice`, `yesno`, and `text` question types with inline `Other`/`Discuss` editing, context-sensitive note hotkeys (`n`), split-pane option previews, and review/revise flows. Fallback path degrades gracefully when rich custom UI is unavailable.

Files: `packages/supi-ask-user/ask-user.ts` (entry), `packages/supi-ask-user/schema.ts` (external contract), `packages/supi-ask-user/normalize.ts` (validation), `packages/supi-ask-user/types.ts` (internal model), `packages/supi-ask-user/flow.ts` (shared state machine), `packages/supi-ask-user/ui-rich.ts` (overlay builder), `packages/supi-ask-user/ui-rich-state.ts` (state types and pure helpers), `packages/supi-ask-user/ui-rich-handlers.ts` (input handlers), `packages/supi-ask-user/ui-rich-render.ts` (core rendering), `packages/supi-ask-user/ui-rich-render-notes.ts` (note rendering), `packages/supi-ask-user/ui-rich-render-editor.ts` (editor pane rendering), `packages/supi-ask-user/ui-rich-inline.ts` (inline Other/Discuss rows), `packages/supi-ask-user/ui-fallback.ts` (fallback path), `packages/supi-ask-user/format.ts` (summary/review formatting), `packages/supi-ask-user/render.ts` (transcript rendering), `packages/supi-ask-user/result.ts` (tool content/details).

No `ask_user` commands — the tool is invoked by the agent via `pi.registerTool`.

### OpenSpec workflow

This repo uses an experimental OpenSpec artifact workflow in `openspec/`. Changes are tracked as directories under `openspec/changes/` with `design.md`, `proposal.md`, `tasks.md`, and `specs/` artifacts. Key skills: `openspec-new-change`, `openspec-continue-change`, `openspec-apply-change`, `openspec-verify-change`, `openspec-archive-change`.

### Skill-shortcut extension

The most complex extension. It wraps pi-tui's `AutocompleteProvider` and `CustomEditor` to intercept `$name` tokens and expand them to `/skill:name`. The editor subclass (`SkillShortcutEditor`) delegates autocomplete to the inner provider unless the cursor is inside a `$`-prefixed token.

### Environment variables honored

| Variable | Extension | Effect |
|---|---|---|
| `PI_BASH_DEFAULT_TIMEOUT` | bash-timeout | Overrides default timeout in seconds (default: 120) |
| `PI_LSP_DISABLED` | lsp | Set to `1` to disable all LSP functionality |
| `PI_LSP_SERVERS` | lsp | Comma-separated allow-list of server names (e.g., `rust-analyzer,pyright`) |
| `PI_LSP_SEVERITY` | lsp | Inline severity threshold: `1`=errors only (default), `2`=+warnings, `3`=+info, `4`=+hints |

## Reading pi docs

All pi documentation is installed alongside the package:

```bash
# Docs (markdown)
ls $(npm root -g)/@mariozechner/pi-coding-agent/docs/
# Examples (working TypeScript)
ls $(npm root -g)/@mariozechner/pi-coding-agent/examples/
# README
cat $(npm root -g)/@mariozechner/pi-coding-agent/README.md
```

With mise the resolved path is:
`~/.local/share/mise/installs/node/<version>/lib/node_modules/@mariozechner/pi-coding-agent/`

Key docs to reach for first:
- `docs/extensions.md` — extension API reference
- `docs/prompt-templates.md` — template format and loading rules
- `docs/packages.md` — `package.json` `pi.*` keys (`extensions`, `prompts`, `skills`, …)
- `docs/skills.md` — skill structure, frontmatter rules, loading order
- `docs/tui.md` — TUI component API (needed for `skill-shortcut`-style work)
- `examples/extensions/` — working reference implementations

## Gotchas

### Dependencies & packaging

- **peerDependencies install as regular deps**: pnpm installs missing peers automatically; after bumping version ranges in `package.json` run `pnpm install` to update the lockfile.
- **`~` version range on peerDeps**: intentional — pins to the minor release train (`~0.66.0` allows `0.66.x` only) to avoid silent breakage from pi API changes across minor versions.
- **`@sinclair/typebox` is a peerDependency**: it's a runtime import (used by `packages/supi-lsp/lsp.ts`) so it must be in `peerDependencies`. pnpm auto-installs it locally for type-checking. Putting it in `devDependencies` breaks `pi install npm:...`. Avoid `@mariozechner/pi-ai`'s `StringEnum` — use `Type.Union(Type.Literal(...))` instead to keep the dep tree smaller.
- **JSON imports**: avoid `import X from "./file.json" with { type: "json" }` — it errors under some tsconfig modes. Use `JSON.parse(fs.readFileSync(path.join(__dirname, "file.json"), "utf-8"))` instead. pi's jiti loader always provides `__dirname`.

### Biome & code style

- **Biome config is `biome.jsonc`** (not `biome.json`): all rule overrides go there. Inline `biome-ignore` comments don't work for file-level nursery rules like `noExcessiveLinesPerFile` — must split the file or raise the threshold in `biome.jsonc`.
- **Always run `biome check --write` on new test files**: biome enforces import order and formatting that won't match hand-written code. Fix first, then verify with `biome:ai`.
- **Biome complexity trips quickly in `packages/supi-lsp/manager.ts`**: prefer small helper functions for summary/aggregation logic before reaching for suppressions.
- **`packages/supi-lsp/summary.ts` holds formatting/relevance helpers**: keep `packages/supi-lsp/manager.ts` focused on state/server management to stay under Biome file-length limits.
- **`skill-shortcut` needs `biome-ignore` for `noExplicitAny`**: the `as any` casts accessing private TUI internals are intentional — each needs an inline `// biome-ignore lint/suspicious/noExplicitAny: accessing private TUI internals` comment.

### pi API & runtime

- **`pi.on("tool_result")` modifies results; `pi.on("tool_call")` only blocks**: use `tool_result` to append diagnostics or context to tool output. Return `{ content, details, isError }` to patch.
- **Session cleanup event is `session_shutdown`** not `session_end`: use for tearing down subprocesses, connections, etc.
- **`ctx.ui.notify()` level is `"warning"` not `"warn"`**: valid values are `"error" | "warning" | "info"`.
- **Local `pi install /path` uses the working tree directly**: confirm the active package path in `~/.pi/agent/settings.json`, then use `/reload` or restart pi after edits.
- **Keep `before_agent_start` guidance stateful**: generic LSP preference belongs in `promptSnippet`/`promptGuidelines`; pre-turn messages should only add actionable diagnostics or relevant active coverage.

### TUI & extensions

- **`skill-shortcut` accesses private TUI internals**: `SkillShortcutEditor` casts `this as any` to reach `autocompleteState`, `state`, and `tryTriggerAutocomplete`. These are undocumented internals and may break on `@mariozechner/pi-tui` upgrades — verify after bumping.
- **`bash-timeout` entry point is `index.ts`**: all other extensions use `dir/dir.ts` naming; `bash-timeout` uses `bash-timeout/index.ts`. This is intentional (copied from source) but inconsistent.
- **Prompt template frontmatter**: only `description:` is supported; Claude-specific keys like `allowed-tools` are silently ignored — strip them when porting Claude commands.

### Testing

- **Test framework is vitest**: unit tests at `packages/supi-lsp/__tests__/*.test.ts` and `packages/supi-ask-user/__tests__/*.test.ts`, integration tests at `*.integration.test.ts`. Integration tests use `describe.skipIf(!HAS_CMD)` to auto-skip when LSP servers aren't on PATH.
- **Unhandled promise rejections fail vitest**: if production code rejects promises during cleanup (e.g., `dispose()`), add `promise.catch(() => {})` at creation to prevent vitest from catching them as test errors.
- **Probe live LSP behavior with a temporary TS error file**: writing `packages/supi-lsp/__tmp_guidance_probe.ts` with an intentional type error exercises both `tool_result` diagnostics and pre-turn guidance.
- **Unit-test LSP manager summaries with fake clients**: cast `manager as unknown as { clients: Map<...> }` to seed coverage/diagnostics; keep real server behavior in `*.integration.test.ts`.
- **TS LSP integration diagnostics can arrive late**: retry `syncFileAndGetDiagnostics()` before asserting non-empty diagnostics in integration tests.

### Ask-user extension

- **`ask-user` uses a split flow**: rich overlay via `ctx.ui.custom()` when available, otherwise fallback dialog. Fallback does NOT support notes, previews, or inline editing.
- **`ask-user` inline `Other`/`Discuss` auto-enters edit mode on keyboard focus**: navigating onto those rows immediately activates inline input. `Esc` exits back to row navigation.
- **`ask-user` multichoice uses `Space` to toggle**: not `Enter`. `Enter` submits the current selection set. The old `Submit selections` row was removed.
- **`ask-user` notes are per-option for multichoice**: `n` hotkey edits a note on the highlighted option. Notes survive uncheck/re-check within the same questionnaire.

### Release & hooks

- **`hk` is the local hook runner**: `commit-msg` checks Conventional Commits, `pre-commit` runs Biome + safety checks, and `pre-push` runs `pnpm verify`.
- **Releases are automated via release-please**: The `Release Please` workflow opens a PR with version bumps and changelogs. Merging it triggers GitHub releases and npm publishes. No local release commands needed.
- **Meta-package dependencies are workspace-linked**: `packages/supi/package.json` lists sub-packages as `workspace:*` dependencies. pnpm replaces these with concrete versions during publish. npm installs them when users install `@mrclrchtr/supi`.
- **Use wrapper entrypoints in the meta-package**: `pi.extensions` entries are package-relative paths. In `packages/supi/`, keep small local `.ts` wrappers that re-export the workspace packages so published installs do not depend on nested `node_modules` layout.

### Misc

- **openspec PostHog errors are harmless**: the CLI emits `PostHogFetchNetworkError` when offline — ignore.
