# Changelog

## [13.0.0]

- **Breaking:** Absorbs the former `@mrclrchtr/supi-bash-timeout` package: `bash` calls without `timeout` get the configured default, now 600 seconds instead of 120 so test and check runs are no longer cut off, configurable under `/supi-settings` → **Bash Timeout**. Migration: run `pi remove npm:@mrclrchtr/supi-bash-timeout`; the `bash-timeout` config section is unchanged.

## [11.3.0]

- Added package-specific release notes for session controls, prompt stashing, shortcuts, and activity indicators.
