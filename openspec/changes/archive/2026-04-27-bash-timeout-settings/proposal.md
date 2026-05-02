## Why

`supi-bash-timeout` currently reads `PI_BASH_DEFAULT_TIMEOUT` from the environment as its only configuration mechanism. This is inconsistent with every other SuPi extension, which expose tunable values through the centralized `/supi-settings` TUI. Users who want to adjust the default bash timeout must discover and set an undocumented environment variable instead of using the discoverable settings overlay.

## What Changes

- Replace `PI_BASH_DEFAULT_TIMEOUT` env-var lookup with a config-backed `bash-timeout` section in the SuPi config system.
- Register a `bash-timeout` settings section via `registerConfigSettings()` so the value appears in `/supi-settings`.
- Add a single setting: **Default Timeout** (seconds, default 120).
- Remove `PI_BASH_DEFAULT_TIMEOUT` env-var support.
- Update tests to use the config system instead of env mocking.

## Capabilities

### New Capabilities
- `bash-timeout-settings`: Configuration surface for `supi-bash-timeout` default timeout value, exposed through the SuPi settings registry.

### Modified Capabilities
- (none — no existing spec-level requirements change)

## Impact

- `packages/supi-bash-timeout/index.ts` — replace env lookup with `loadSupiConfig`.
- `packages/supi-bash-timeout/` — new `settings-registration.ts` and `config.ts` modules.
- `packages/supi-bash-timeout/__tests__/` — update tests to mock config instead of env.
- `packages/supi-core/` — no changes; uses existing `registerConfigSettings` / `loadSupiConfig` infrastructure.
