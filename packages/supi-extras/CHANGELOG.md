# Changelog

## [15.0.0]

- In RPC, the tab title spinner no longer sends a `setTitle` record about every 80 ms. While the agent works, the title shows a static `⠋` and is sent again only when its text changes, for example after `/name`. The TUI animation is unchanged ([#663](https://github.com/mrclrchtr/supi/issues/663)).

## [14.3.0]

- The footer path line shows the GitHub issues and pull requests named in the first user message after the session name, for example `• #12 acme/app#5`, linked to GitHub in terminals that support hyperlinks. A bare `#12` resolves against a GitHub `origin` remote. Turn it off under `/supi-settings` → **Footer** → **Issue link**.

## [14.0.0]

- The footer is organized in sections with one separator. The path line now holds workspace state: path and Git on the left, the LSP status on the right. The session line holds metrics on the left and the model on the right, with status icons such as Consulting `✦` and Session Capabilities `◈` before the model name. Sections are separated by a dim ` · ` everywhere, including between model and thinking level (formerly `•`). A subscription shows as `$3.113 sub` instead of `$3.113 (sub)`. When the window is narrow, the right side of each line shortens first. Nerd Font icons now come from one Material Design outline set: folder (U+F0256), branch (U+F062C), session name (U+F00C3), and stash (U+F120E), with one space after the folder icon instead of two.
- Extension statuses set through Pi's `setStatus()` still appear on the status line; a status with the same key as a SuPi footer contribution is shown only once.

## [13.0.0]

- **Breaking:** Absorbs the former `@mrclrchtr/supi-bash-timeout` package: `bash` calls without `timeout` get the configured default, now 600 seconds instead of 120 so test and check runs are no longer cut off, configurable under `/supi-settings` → **Bash Timeout**. Migration: run `pi remove npm:@mrclrchtr/supi-bash-timeout`; the `bash-timeout` config section is unchanged. While `@mrclrchtr/supi-bash-timeout` is still declared in user or trusted project settings, SuPi Extras shows one warning per Pi process with the exact `pi remove` command, adding `--local` for project declarations ([#596](https://github.com/mrclrchtr/supi/issues/596)).
- The footer path line shows Git ahead/behind, file counts, and branch stashes next to the branch, plus Nerd Font, Unicode, or ASCII icons. The stats line groups its values, colors cache-hit and context thresholds, and shows a context bar. Configure both under `/supi-settings` → **Footer**.
- Collapsed rows of Pi's `codemode` tool are compact: script first line (a leading comment shows as plain text), nested calls with their key argument (repeats merged as `×N`; at most 8 rows with failures kept and a `… N more calls: bash ×4, read ×4` row for the rest), a status summary, and the first output line. Expanded rows keep Pi's full view. Turn them off under `/supi-settings` → **Codemode View**.

## [11.3.0]

- Added package-specific release notes for session controls, prompt stashing, shortcuts, and activity indicators.
