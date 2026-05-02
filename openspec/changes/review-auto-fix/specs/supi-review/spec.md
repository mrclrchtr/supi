## ADDED Requirements

### Requirement: Review message content contains full structured result for agent context
The injected `supi-review` custom message SHALL set `content` to a markdown representation of the review result that includes numbered findings with file paths, line ranges, priority labels, titles, and bodies. The TUI custom renderer continues to use `details` for display; `content` serves only the LLM context.

#### Scenario: Successful review with findings
- **WHEN** the review completes with findings
- **THEN** the `content` field SHALL contain a markdown document with a "Code Review Result" heading, the verdict and confidence, and each finding numbered sequentially (`#1`, `#2`, …) with priority label, title, file path, line range, and body text, followed by the overall explanation

#### Scenario: Successful review with no findings
- **WHEN** the review completes with zero findings
- **THEN** the `content` field SHALL contain the verdict, confidence, and overall explanation without a findings section

#### Scenario: Failed, canceled, or timed-out review
- **WHEN** the review result kind is `failed`, `canceled`, or `timeout`
- **THEN** the `content` field SHALL contain a short summary string (same as current behavior)

### Requirement: Auto-fix toggle in interactive flow
After the depth selector, the interactive flow SHALL present an auto-fix selector with two options: "Yes — fix all findings" and "No — review only". The selector SHALL pre-select the value from the persisted `autoFix` setting.

#### Scenario: User selects auto-fix yes
- **WHEN** the user selects "Yes — fix all findings" in the auto-fix selector
- **THEN** the extension SHALL send a `pi.sendUserMessage("Fix all findings from the review above.")` after injecting the review result, triggering an agent turn

#### Scenario: User selects auto-fix no
- **WHEN** the user selects "No — review only" in the auto-fix selector
- **THEN** the extension SHALL inject the review result without triggering a follow-up turn

#### Scenario: User cancels auto-fix selector
- **WHEN** the user presses Escape in the auto-fix selector
- **THEN** the review is aborted and no review is started

#### Scenario: Auto-fix with no findings
- **WHEN** auto-fix is enabled but the review completes with zero findings
- **THEN** the extension SHALL NOT send a follow-up user message

#### Scenario: Auto-fix with non-success result
- **WHEN** auto-fix is enabled but the review result is failed, canceled, or timed out
- **THEN** the extension SHALL NOT send a follow-up user message

### Requirement: Auto-fix flag in non-interactive arguments
The non-interactive argument grammar SHALL accept `--auto-fix` and `--no-auto-fix` flags. When neither flag is present, the persisted `autoFix` setting value SHALL be used.

#### Scenario: Non-interactive with --auto-fix
- **WHEN** the user invokes `/supi-review uncommitted --auto-fix`
- **THEN** auto-fix is enabled regardless of the persisted setting

#### Scenario: Non-interactive with --no-auto-fix
- **WHEN** the user invokes `/supi-review base-branch main --no-auto-fix`
- **THEN** auto-fix is disabled regardless of the persisted setting

#### Scenario: Non-interactive without auto-fix flag
- **WHEN** the user invokes `/supi-review uncommitted`
- **THEN** auto-fix is determined by the persisted `autoFix` setting value

### Requirement: Auto-fix setting in review configuration
The review settings section SHALL include an `autoFix` boolean setting with a default value of `false`. It SHALL be displayed in `/supi-settings` as "Auto-Fix After Review" with cycle values `on` and `off`.

#### Scenario: autoFix setting defaults to false
- **WHEN** no `autoFix` value is configured
- **THEN** auto-fix is disabled by default

#### Scenario: User enables autoFix in settings
- **WHEN** the user sets `autoFix` to `on` in `/supi-settings`
- **THEN** the persisted config stores `autoFix: true` and the interactive auto-fix selector pre-selects "Yes"

#### Scenario: User disables autoFix in settings
- **WHEN** the user sets `autoFix` to `off` in `/supi-settings`
- **THEN** the persisted config stores `autoFix: false` (or removes the key) and the interactive auto-fix selector pre-selects "No"

## MODIFIED Requirements

### Requirement: Non-interactive fallback runs without TUI
When `ctx.hasUI` is false, the `/supi-review` command SHALL accept arguments to specify the target directly and skip the TUI selectors.

The non-interactive grammar SHALL be:
```text
/supi-review base-branch <branch> [--depth inherit|fast|deep] [--auto-fix|--no-auto-fix]
/supi-review uncommitted [--depth inherit|fast|deep] [--auto-fix|--no-auto-fix]
/supi-review commit <sha> [--depth inherit|fast|deep] [--auto-fix|--no-auto-fix]
/supi-review custom [--depth inherit|fast|deep] [--auto-fix|--no-auto-fix] -- <instructions...>
```

#### Scenario: Print mode reviews a base branch
- **WHEN** pi runs in print mode and the user invokes `/supi-review base-branch main`
- **THEN** the extension resolves the base branch target and runs the reviewer without showing a TUI

#### Scenario: Print mode reviews uncommitted changes
- **WHEN** pi runs in print mode and the user invokes `/supi-review uncommitted --depth fast`
- **THEN** the extension resolves uncommitted changes and runs the reviewer with Fast depth without showing a TUI

#### Scenario: Print mode reviews a commit
- **WHEN** pi runs in print mode and the user invokes `/supi-review commit abc123 --depth deep`
- **THEN** the extension runs `git show abc123` and runs the reviewer with Deep depth without showing a TUI

#### Scenario: Print mode runs custom review
- **WHEN** pi runs in print mode and the user invokes `/supi-review custom -- Focus on security regressions`
- **THEN** the extension passes `Focus on security regressions` as the review prompt without showing a TUI

#### Scenario: Print mode without arguments
- **WHEN** pi runs in print mode and the user invokes `/supi-review` without arguments
- **THEN** the extension returns an error message explaining the required arguments

#### Scenario: Print mode with invalid arguments
- **WHEN** pi runs in print mode and the user invokes `/supi-review unknown`
- **THEN** the extension returns an error message showing the supported grammar and does not start a review

#### Scenario: Print mode with auto-fix flag
- **WHEN** pi runs in print mode and the user invokes `/supi-review uncommitted --auto-fix`
- **THEN** the extension runs the reviewer and, if findings are found, sends a follow-up user message to trigger auto-fix

### Requirement: Settings support review model and timeout configuration
The extension SHALL register `reviewFastModel`, `reviewDeepModel`, `maxDiffBytes`, `reviewTimeoutMinutes`, and `autoFix` settings with the SuPi settings registry.

#### Scenario: User configures fast model
- **WHEN** the user sets `reviewFastModel` to `openai/gpt-4o-mini` in settings
- **THEN** subsequent "Fast" reviews use that model

#### Scenario: User configures deep model
- **WHEN** the user sets `reviewDeepModel` to `anthropic/claude-sonnet-4-5` in settings
- **THEN** subsequent "Deep" reviews use that model

#### Scenario: No models configured
- **WHEN** no review model settings are configured
- **THEN** all depths default to the current session model

#### Scenario: User configures review timeout
- **WHEN** the user sets `reviewTimeoutMinutes` to `25` in settings
- **THEN** subsequent reviews use a subprocess timeout of `1500000ms`

#### Scenario: No timeout configured
- **WHEN** no review timeout setting is configured
- **THEN** reviews default to a subprocess timeout of `900000ms` (15 minutes)

#### Scenario: User configures autoFix
- **WHEN** the user sets `autoFix` to `on` in settings
- **THEN** the interactive auto-fix selector defaults to "Yes" and the non-interactive path enables auto-fix when no flag is specified
