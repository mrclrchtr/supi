# supi-extras

Collection of small pi extension utilities bundled into one package.

## Package layout

Source stays flat per convention. Tests are organized into `unit/` and `integration/` subdirectories.

```
src/
├── index.ts
├── extension.ts
├── aliases.ts
├── clipboard.ts
├── clone-session.ts
├── copy-prompt.ts
├── git-editor.ts
├── supi-footer.ts
├── supi-footer-helpers.ts
├── prompt-stash.ts
├── session-capabilities.ts
├── session-capabilities-state.ts
├── session-capabilities-tools.ts
├── session-capabilities-ui.ts
└── tab-spinner.ts
__tests__/
├── tsconfig.json
├── unit/
│   ├── clipboard.test.ts
│   ├── clone-session.test.ts
│   ├── copy-prompt.test.ts
│   ├── git-editor.test.ts
│   ├── supi-footer.test.ts
│   ├── prompt-stash.test.ts
│   ├── session-capabilities.test.ts
│   ├── session-capabilities-reconciliation.test.ts
│   ├── session-capabilities-ui.test.ts
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
| `clone-session.ts` | `/clone-session <session-id>` clones a session into the current worktree and switches to it |
| `tab-spinner.ts` | Braille spinner in terminal tab title during agent work + `supi:working:*` events |
| `prompt-stash.ts` | Persistent prompt stash with `Alt+S` shortcut and `/supi-stash` overlay |
| `session-capabilities.ts`, `session-capabilities-state.ts`, `session-capabilities-ui.ts` | Register session controls, store snapshots through `supi-core/session`, and render the selector |
| `session-capabilities-tools.ts` | Applies explicit tool choices, preserves unknown restrictions, and reconciles the live tool list |
| `git-editor.ts` | Sets `GIT_EDITOR=true` to prevent git from blocking on interactive editors |
| `aliases.ts` | `/exit`, `/clear` (→ `/new`), `/e` (→ `/exit`) command aliases |
| `supi-footer.ts` | PI-theme-native footer replacement — model name colored by provider, thinking level delegated to Pi's `theme.getThinkingBorderColor` |
| `supi-footer-helpers.ts` | Pure helpers (provider color mapping, stats, layout) for the footer extension |

## Gotchas

- **Tab spinner**: PI sets the terminal title directly on `this.ui.terminal` during startup — it never flows through `ctx.ui.setTitle`. The spinner maintains the session name reactively via `createSessionNameTracker`; the per-tick `pi.getSessionName()` call now serves only as a stale-context canary.
- **Prompt stash**: Persists to `~/.pi/agent/supi/prompt-stash.json`. `/supi-stash` uses `ctx.ui.custom(..., { overlay: true })` with restore, copy, delete, and clear-all actions inside the overlay.
- **Session capabilities**: Keep built-in and SDK tools out. Never expose or activate a tool that was inactive at startup. Keep unknown saved tool restrictions because PI has no final tool-registration event. Apply only explicit tool choices after tree navigation. Group tools by `sourceInfo.source`; do not infer package identity from paths. Skill controls need the optional provider from `supi-skills`.
- **Copy prompt**: `Alt+C` replaces the old `Ctrl+Shift+S` copy shortcut (removed from prompt-stash). Both `copy-prompt.ts` and stash overlay share the same `clipboard.ts` utility, which now delegates to `clipboardy`.
- **Git editor**: Sets env vars unconditionally — pi runs headless and any editor invocation hangs.
