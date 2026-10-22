# supi-extras

Collection of small pi extension utilities bundled into one package.

## Ownership

Keep these small utilities flat. Shared clipboard behavior belongs in `clipboard.ts`; both copy-prompt and prompt-stash use it. Session capability snapshots belong in `supi-core/session`, while this package owns the selector and reconciliation of explicit tool choices.

## Gotchas

- **Tab spinner**: PI sets the terminal title directly on `this.ui.terminal` during startup — it never flows through `ctx.ui.setTitle`. The spinner maintains the session name reactively via `createSessionNameTracker`; the per-tick `pi.getSessionName()` call now serves only as a stale-context canary.
- **Prompt stash**: Persists to `~/.pi/agent/supi/prompt-stash.json`. `/supi-stash` uses `ctx.ui.custom(..., { overlay: true })` with restore, copy, delete, and clear-all actions inside the overlay.
- **Session capabilities**: Keep built-in and SDK tools out. Never expose or activate a tool that was inactive at startup. Keep unknown saved tool restrictions because PI has no final tool-registration event. Apply only explicit tool choices after tree navigation. Group tools by `sourceInfo.source`; do not infer package identity from paths. Skill controls need the optional provider from `supi-skills`.
- **Capability profiles**: Profiles are scoped exclusion snapshots. Project profile access requires trust; saving a profile does not apply it to the live session. Defaults seed only eligible new/empty startup sessions.
- **Git editor**: Sets env vars unconditionally — pi runs headless and any editor invocation hangs.
