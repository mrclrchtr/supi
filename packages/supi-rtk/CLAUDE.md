# CLAUDE.md

## Scope

`@mrclrchtr/supi-rtk` registers a `bash` tool override that transparently rewrites commands through the [RTK](https://github.com/joshcho/RTK) CLI for token savings. It also exposes session statistics via a context provider.

## Key files

- `rtk.ts` — extension wiring, tool override, settings, `user_bash` interception
- `rewrite.ts` — `rtk rewrite` CLI invocation with structured error classification
- `guards.ts` — SuPi-side passthrough guard for RTK rewrite collisions (notably Biome commands rewritten to `rtk lint`)
- `tracking.ts` — session-level rewrite/fallback stats

## Validation

- `pnpm vitest run packages/supi-rtk/ && pnpm exec biome check packages/supi-rtk`

## RTK CLI behavior

- `rtk rewrite <command>` returns exit code **3** on successful rewrites (rewritten command on stdout); non-zero exit alone is not a failure.
- RTK cannot rewrite multi-line commands; if the shell `commandPrefix` is present, it must be stripped before calling `rtk rewrite` and re-applied to the result.
- Guard known lossy RTK rewrite collisions before invoking `rtk rewrite`; for example, Biome commands and Biome-backed `lint` scripts should pass through until upstream RTK fixes `pnpm exec biome` / `npm run lint` routing.
- TODO: remove the SuPi Biome rewrite workaround after rtk-ai/rtk#665 and rtk-ai/rtk#1489 close and the `pnpm exec biome ...` routing gap is fixed upstream.

## Testing gotchas

- Tests mock `createBashTool` without exercising the real `commandPrefix` → `spawnHook` ordering; prefix-related bugs require manual/live verification with `supi_debug`.
- `rtkAvailable` and `warnedAboutUnavailableRtk` are module-level mutable state reset on `session_start`; test isolation must call the `session_start` handler or re-instantiate the extension.
