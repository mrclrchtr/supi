## Why

Tool results consume the most context tokens in typical sessions (often 60–80% of used context). Shell command outputs — git, grep, test runners, ls — are the largest contributors. RTK (Rust Token Killer) compresses these by 60–90% at the CLI level, but there is no pi-native integration. Existing third-party pi-rtk extensions proved the approach works but are not part of the SuPi stack.

## What Changes

- New `supi-rtk` workspace package that rewrites bash commands through RTK's `rtk rewrite` CLI before execution
- Uses pi's `createBashTool` + `spawnHook` to replace the built-in bash tool transparently
- Hooks `user_bash` for `!cmd` context-visible user shell commands
- Tracks per-session rewrite count and estimated token savings
- New supi-core context-provider registry so extensions can expose data to `/supi-context` without hard dependencies
- `supi-context` updated to render any registered context provider sections (e.g. RTK savings)
- Requires `rtk` binary installed and available on PATH

## Capabilities

### New Capabilities
- `rtk-bash-rewrite`: Bash command rewriting via `rtk rewrite` CLI, user_bash hooking, savings tracking, and supi-core settings integration
- `context-provider-registry`: Shared supi-core registry allowing extensions to expose data sections for `/supi-context` rendering

### Modified Capabilities
- `context-usage-command`: Render registered context provider sections when available

## Impact

- New package: `packages/supi-rtk/`
- New supi-core module: `context-provider-registry.ts`
- Modified: `packages/supi-context/` (analysis + format) to consume registered providers
- Modified: `packages/supi/` meta-package (new dependency + re-export)
- Modified: root `package.json` (extensions list)
- External runtime dependency: `rtk` binary (hard requirement)
