## Context

`supi-bash-timeout` currently hardcodes a 120-second default timeout and allows override only via the `PI_BASH_DEFAULT_TIMEOUT` environment variable. Every other SuPi extension (`claude-md`, `lsp`, `review`) already uses the shared `registerConfigSettings()` helper to expose tunables through `/supi-settings`. This change brings `bash-timeout` into alignment.

The shared config system (`supi-core/config.ts`) already supports per-extension sections, per-scope persistence (global vs project), and the `registerConfigSettings()` wrapper that binds a section to the settings TUI. No new infrastructure is needed.

## Goals / Non-Goals

**Goals:**
- Replace env-var configuration with the SuPi config system.
- Make the default timeout visible and editable in `/supi-settings`.
- Keep the same default value (120 seconds) so existing behavior is unchanged.

**Non-Goals:**
- Changing timeout semantics (still seconds, still injected only when LLM omits one).
- Adding per-project bash timeout overrides (the config system already supports this via scope toggle, no extra work needed).
- Migrating `PI_CODING_AGENT_DIR` or any other env vars — this is scoped to `bash-timeout` only.

## Decisions

**Use `registerConfigSettings()` instead of raw `registerSettings()`**

`registerConfigSettings()` is the config-backed wrapper in `supi-core` that handles scope-aware loading and persistence. It is the exact pattern used by `claude-md`, `lsp`, and `review`. Using it keeps `bash-timeout` consistent and eliminates boilerplate.

**Remove `PI_BASH_DEFAULT_TIMEOUT` entirely rather than deprecate it**

The env var was never documented in SuPi's README or settings guide. There is no migration path to preserve because the new config file location (`~/.pi/agent/supi/config.json`) is the natural place for this value. Keeping the env var as a fallback would create a dual-source-of-truth problem.

**Single setting: `defaultTimeout` (integer, seconds)**

A single numeric setting is sufficient. The prior behavior was a single scalar; no need to over-design. The setting is rendered as a text-input submenu (same pattern as `claude-md` reread interval and `review` max diff size).

## Risks / Trade-offs

- **[Risk]** Users who previously set `PI_BASH_DEFAULT_TIMEOUT` will need to re-set the value via `/supi-settings`.
  → **Mitigation**: The default is unchanged (120s), so most users will not notice. For the rare user who customized it, the new setting is more discoverable.

- **[Risk]** Tests that mock `process.env.PI_BASH_DEFAULT_TIMEOUT` will break.
  → **Mitigation**: Update tests to mock `loadSupiConfig` (via `vi.mock("@mrclrchtr/supi-core")`) instead.

## Open Questions

- (none)
