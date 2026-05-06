# supi-extras

Collection of small pi extension utilities bundled into one package.

## Commands

```bash
pnpm vitest run packages/supi-extras/
pnpm exec tsc --noEmit -p packages/supi-extras/tsconfig.json
pnpm exec biome check packages/supi-extras/
```

## Modules

`src/index.ts` composes five independent extensions:

| Module | What it does |
|---|---|
| `tab-spinner.ts` | Braille spinner in terminal tab title during agent work + `supi:working:*` events |
| `prompt-stash.ts` | In-memory prompt stash with `Alt+S`/`Ctrl+Shift+S` shortcuts and `/stash*` commands |
| `git-editor.ts` | Sets `GIT_EDITOR=true` to prevent git from blocking on interactive editors |
| `aliases.ts` | `/exit`, `/clear` (→ `/new`), `/e` (→ `/exit`) command aliases |
| `skill-shortcut.ts` | `$skill-name` → `/skill:skill-name` expansion + fuzzy autocomplete |

## Gotchas

- **Tab spinner**: PI sets the terminal title directly on `this.ui.terminal` during startup — it never flows through `ctx.ui.setTitle`. The spinner recomputes the base title dynamically with `pi.getSessionName()` + `ctx.cwd` on every tick so `/name` renames are reflected.
- **Prompt stash**: Session-scoped (in-memory only), cleared on session shutdown or `/stash-clear`. Uses `[id] name` label encoding for `ctx.ui.select()` since it only accepts `string[]`.
- **Skill shortcut**: Installed skill names are snapshotted at `session_start`; use `/reload` after adding/removing skills. Outside `$...` tokens, autocomplete delegates to the current provider.
- **Git editor**: Sets env vars unconditionally — pi runs headless and any editor invocation hangs.
