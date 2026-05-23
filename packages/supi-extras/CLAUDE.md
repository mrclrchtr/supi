# supi-extras

Collection of small pi extension utilities bundled into one package.

## Commands

```bash
pnpm vitest run packages/supi-extras/
pnpm exec tsc --noEmit -p packages/supi-extras/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-extras/__tests__/tsconfig.json
pnpm exec biome check packages/supi-extras/
```

## Package layout

Source stays flat per convention. Tests are organized into `unit/` and `integration/` subdirectories.

```
src/
├── api.ts
├── index.ts
├── extension.ts
├── aliases.ts
├── clipboard.ts
├── copy-prompt.ts
├── git-editor.ts
├── model-effort-colors.ts
├── model-effort-colors-helpers.ts
├── prompt-stash.ts
├── skill-shortcut.ts
└── tab-spinner.ts
__tests__/
├── tsconfig.json
├── unit/
│   ├── clipboard.test.ts
│   ├── copy-prompt.test.ts
│   ├── git-editor.test.ts
│   ├── model-effort-colors.test.ts
│   ├── prompt-stash.test.ts
│   └── tab-spinner.test.ts
└── integration/
    └── packaging.test.ts
```

## Modules

`src/index.ts` composes extensions and shared utilities:

| Module | What it does |
|---|---|
| `clipboard.ts` | Shared clipboard utility — wraps `clipboardy` for cross-platform copy |
| `copy-prompt.ts` | `Alt+C` (Option+C) to copy the current editor text to clipboard |
| `tab-spinner.ts` | Braille spinner in terminal tab title during agent work + `supi:working:*` events |
| `prompt-stash.ts` | Persistent prompt stash with `Alt+S` shortcut and `/supi-stash` overlay |
| `git-editor.ts` | Sets `GIT_EDITOR=true` to prevent git from blocking on interactive editors |
| `aliases.ts` | `/exit`, `/clear` (→ `/new`), `/e` (→ `/exit`) command aliases |
| `skill-shortcut.ts` | `$skill-name` → `/skill:skill-name` expansion + fuzzy autocomplete |
| `model-effort-colors.ts` | PI-theme-native footer coloring — model name colored by provider, thinking level colored by intensity |
| `model-effort-colors-helpers.ts` | Pure helpers (color mapping, stats, layout) for the footer extension |

## Gotchas

- **Tab spinner**: PI sets the terminal title directly on `this.ui.terminal` during startup — it never flows through `ctx.ui.setTitle`. The spinner recomputes the base title dynamically with `pi.getSessionName()` + `ctx.cwd` on every tick so `/name` renames are reflected.
- **Prompt stash**: Persists to `~/.pi/agent/supi/prompt-stash.json`. `/supi-stash` uses `ctx.ui.custom(..., { overlay: true })` with restore, copy, delete, and clear-all actions inside the overlay.
- **Copy prompt**: `Alt+C` replaces the old `Ctrl+Shift+S` copy shortcut (removed from prompt-stash). Both `copy-prompt.ts` and stash overlay share the same `clipboard.ts` utility, which now delegates to `clipboardy`.
- **Skill shortcut**: Installed skill names are snapshotted at `session_start`; use `/reload` after adding/removing skills. Outside `$...` tokens, autocomplete delegates to the current provider.
- **Git editor**: Sets env vars unconditionally — pi runs headless and any editor invocation hangs.
