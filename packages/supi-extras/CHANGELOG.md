# Changelog

## [13.0.0]

- **Breaking:** Absorbs the former `@mrclrchtr/supi-bash-timeout` package: `bash` calls without `timeout` get the configured default, now 600 seconds instead of 120 so test and check runs are no longer cut off, configurable under `/supi-settings` → **Bash Timeout**. Migration: run `pi remove npm:@mrclrchtr/supi-bash-timeout`; the `bash-timeout` config section is unchanged.
- The footer path line shows Git ahead/behind, file counts, and branch stashes next to the branch, plus Nerd Font, Unicode, or ASCII icons. The stats line groups its values, colors cache-hit and context thresholds, and shows a context bar. Configure both under `/supi-settings` → **Footer**.
- Collapsed rows of Pi's `codemode` tool are compact: script first line, nested calls, a status summary, and the first output line. Expanded rows keep Pi's full view. Turn them off under `/supi-settings` → **Codemode View**.

## [11.3.0]

- Added package-specific release notes for session controls, prompt stashing, shortcuts, and activity indicators.
