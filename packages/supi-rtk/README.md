![SuPi](assets/logo.png)

# @mrclrchtr/supi-rtk

Adds RTK-backed bash rewriting to the [pi coding agent](https://github.com/earendil-works/pi).

## Install

```bash
pi install npm:@mrclrchtr/supi-rtk
```

This is a **beta** package. Install individually.

For local development:

```bash
pi install ./packages/supi-rtk
```

## What you get

After install, the package intercepts bash execution in two places:

- model `bash` tool calls
- `user_bash` execution paths

For each command, it tries to run `rtk rewrite <command>` first. If RTK returns a usable rewrite, the rewritten command is executed. If not, the original command runs unchanged.

## Fallback and guard behavior

The package falls back to normal bash execution when:

- RTK is disabled in settings
- the `rtk` binary is not available on `PATH`
- the rewrite times out
- RTK exits without usable output
- a guard rule decides the command should bypass rewriting

Current bypass rules include:

- commands prefixed with `RTK_DISABLED=1` or `env RTK_DISABLED=1`
- commands that invoke `biome`
- `rg` commands
- package-manager `lint` commands in projects that use Biome

These guards exist because the current RTK rewrite path can be lossy for those command shapes.

## Settings

This package registers an **RTK** section in `/supi-settings`.

Available settings:

- `enabled` — turn RTK rewriting on or off
- `rewriteTimeout` — timeout in milliseconds for `rtk rewrite`

Defaults:

```json
{
  "rtk": {
    "enabled": true,
    "rewriteTimeout": 5000
  }
}
```

## Extra integration

- registers an **RTK** provider section for `/supi-context`
- tracks successful rewrites, fallbacks, and estimated token savings for the current session
- records debug events through `supi-core`'s debug registry, so `supi-debug` can inspect rewrite and fallback activity when installed
- warns once per session when RTK is enabled but the `rtk` binary is missing

## Source

- `src/rtk.ts` — extension wiring, bash interception, settings, and context-provider registration
- `src/rewrite.ts` — `rtk rewrite` execution and result classification
- `src/guards.ts` — bypass rules for known lossy rewrites
- `src/tracking.ts` — per-session rewrite statistics
