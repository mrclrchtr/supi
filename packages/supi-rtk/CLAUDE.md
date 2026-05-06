# CLAUDE.md

## Scope

`@mrclrchtr/supi-rtk` registers a `bash` tool override that transparently rewrites commands through the [RTK](https://github.com/joshcho/RTK) CLI for token savings. It also exposes session statistics via a context provider.

## Architecture

Registers a `bash` tool override (`createBashTool`) with a `spawnHook` that intercepts commands before execution:
1. `guards.ts` checks for known lossy RTK rewrite collisions (Biome, ripgrep) → passthrough
2. `rewrite.ts` invokes `rtk rewrite <command>` to transform the command
3. Rewritten command (or original on RTK failure) is passed to the real bash tool
4. `tracking.ts` accumulates rewrite/fallback stats exposed as context

## Key files

- `rtk.ts` — extension wiring, tool override, settings, `user_bash` interception
- `rewrite.ts` — `rtk rewrite` CLI invocation with structured error classification
- `guards.ts` — SuPi-side passthrough guard for RTK rewrite collisions
- `tracking.ts` — session-level rewrite/fallback stats

## Commands

```bash
pnpm vitest run packages/supi-rtk/
pnpm exec tsc --noEmit -p packages/supi-rtk/tsconfig.json
pnpm exec biome check packages/supi-rtk/
```

## RTK CLI behavior

- `rtk rewrite <command>` returns exit code **3** on successful rewrites (rewritten command on stdout); non-zero exit alone is not a failure.
- RTK cannot rewrite multi-line commands; if the shell `commandPrefix` is present, it must be stripped before calling `rtk rewrite` and re-applied to the result.
- Guard known lossy RTK rewrite collisions before invoking `rtk rewrite`; for example, Biome commands and Biome-backed `lint` scripts should pass through until upstream RTK fixes `pnpm exec biome` / `npm run lint` routing.
- TODO: remove the SuPi Biome rewrite workaround after rtk-ai/rtk#665 and rtk-ai/rtk#1489 close and the `pnpm exec biome ...` routing gap is fixed upstream.
- `rg` (ripgrep) commands are guarded because RTK rewrites `rg → grep` without translating ripgrep-specific flags (`-g`, `-U`, `--glob`). Tracked upstream at rtk-ai/rtk#1367 and rtk-ai/rtk#1604.

## Testing gotchas

- Tests mock `createBashTool` without exercising the real `commandPrefix` → `spawnHook` ordering; prefix-related bugs require manual/live verification with `supi_debug`.
- `rtkAvailable` and `warnedAboutUnavailableRtk` are module-level mutable state reset on `session_start`; test isolation must call the `session_start` handler or re-instantiate the extension.
