## 1. Config and Settings Registration

- [x] 1.1 Create `packages/supi-bash-timeout/config.ts` with `BashTimeoutConfig` interface, `BASH_TIMEOUT_DEFAULTS`, and `loadBashTimeoutConfig()` helper.
- [x] 1.2 Create `packages/supi-bash-timeout/settings-registration.ts` with `registerBashTimeoutSettings()` using `registerConfigSettings()`.
- [x] 1.3 Export `registerBashTimeoutSettings` and `loadBashTimeoutConfig` from `packages/supi-bash-timeout/index.ts` (or keep private and use directly in extension entrypoint).

## 2. Extension Entrypoint Update

- [x] 2.1 Replace `process.env.PI_BASH_DEFAULT_TIMEOUT` lookup in `packages/supi-bash-timeout/index.ts` with `loadBashTimeoutConfig(ctx.cwd).defaultTimeout`.
- [x] 2.2 Call `registerBashTimeoutSettings()` in the extension factory function.
- [x] 2.3 Remove `DEFAULT_TIMEOUT_SECONDS` constant and `getDefaultTimeout()` function; use config-loaded value instead.

## 3. Tests

- [x] 3.1 Create `packages/supi-bash-timeout/__tests__/config.test.ts` testing `loadBashTimeoutConfig` with mocked `supi-core` config functions.
- [x] 3.2 Create `packages/supi-bash-timeout/__tests__/settings-registration.test.ts` testing that `registerBashTimeoutSettings` calls `registerConfigSettings` with correct shape.
- [x] 3.3 Update `packages/supi-bash-timeout/__tests__/extension.test.ts` (or create if missing) to mock `loadSupiConfig` instead of `process.env`.
- [x] 3.4 Add tests for invalid timeout values (non-numeric, zero, negative) falling back to 120.

## 4. Verification

- [x] 4.1 Run `pnpm exec biome check --write packages/supi-bash-timeout`.
- [x] 4.2 Run `pnpm typecheck` for the package.
- [x] 4.3 Run `pnpm test` for the package.
- [x] 4.4 Run `pnpm verify` for full workspace check.
- [x] 4.5 Dry-run: `/reload` in pi and verify `/supi-settings` shows "Bash Timeout" section.
