## ADDED Requirements

### Requirement: Review command presents preset selector
The extension SHALL register a `/review` command that, when invoked interactively, displays a TUI preset selector with four options: "Review against a base branch", "Review uncommitted changes", "Review a commit", and "Custom review instructions".

#### Scenario: User invokes /review in interactive mode
- **WHEN** the user types `/review` and presses Enter
- **THEN** the TUI displays a preset selector with the four options

#### Scenario: User cancels preset selection
- **WHEN** the user presses Escape in the preset selector
- **THEN** the selector closes and no review is started

### Requirement: Base branch review resolves merge base
When the user selects "Review against a base branch", the extension SHALL compute the merge base between HEAD and the selected branch, gather the diff from that merge base to HEAD, and present the result to the reviewer.

#### Scenario: Successful base branch review
- **WHEN** the user selects "Review against a base branch" and picks "main"
- **THEN** the extension runs `git merge-base HEAD main`, captures the SHA, runs `git diff <sha>`, and passes the diff to the reviewer

#### Scenario: No merge base found
- **WHEN** the selected branch has no merge base with HEAD
- **THEN** the extension notifies the user and aborts the review

### Requirement: Uncommitted changes review captures working tree diff
When the user selects "Review uncommitted changes", the extension SHALL capture staged, unstaged, and untracked file changes and present them to the reviewer.

#### Scenario: Working tree has changes
- **WHEN** the user selects "Review uncommitted changes"
- **THEN** the extension runs `git diff --cached`, `git diff`, and lists untracked files, combining them into a single review prompt

#### Scenario: Working tree is clean
- **WHEN** the user selects "Review uncommitted changes" but the working tree has no changes
- **THEN** the extension notifies the user and aborts the review

### Requirement: Commit review targets a specific commit
When the user selects "Review a commit", the extension SHALL present a commit picker with recent commits and, upon selection, review the changes introduced by that commit.

#### Scenario: User selects a recent commit
- **WHEN** the user selects "Review a commit" and picks a commit from the list
- **THEN** the extension runs `git show <sha>` and passes the output to the reviewer

### Requirement: Custom review accepts free-form instructions
When the user selects "Custom review instructions", the extension SHALL prompt for free-form text and pass it directly to the reviewer as the review task.

#### Scenario: User provides custom instructions
- **WHEN** the user selects "Custom review instructions" and types "Focus on security regressions"
- **THEN** the extension passes the text as the review prompt

#### Scenario: User provides empty instructions
- **WHEN** the user submits empty custom instructions
- **THEN** the extension aborts the review

### Requirement: Depth selector chooses review model
After selecting a review target, the extension SHALL present a depth selector with three options: "Inherit" (current session model), "Fast" (lightweight model), and "Deep" (strong model).

#### Scenario: User selects Fast depth
- **WHEN** the user selects "Fast" in the depth selector
- **THEN** the reviewer subprocess uses the model configured as `reviewFastModel` (or the session model if unset)

#### Scenario: User selects Deep depth
- **WHEN** the user selects "Deep" in the depth selector
- **THEN** the reviewer subprocess uses the model configured as `reviewDeepModel` (or the session model if unset)

#### Scenario: User selects Inherit depth
- **WHEN** the user selects "Inherit" in the depth selector
- **THEN** the reviewer subprocess uses the current session model

### Requirement: Reviewer runs in isolated subprocess
The reviewer SHALL run in a dedicated `pi --mode json --no-session` subprocess with an isolated context window, restricted to `read`, `grep`, `find`, and `ls` tools.

#### Scenario: Subprocess starts with correct arguments
- **WHEN** the extension launches the reviewer with a resolved model
- **THEN** the subprocess is invoked with `--mode json`, `--no-session`, `--tools read,grep,find,ls`, `--model <model>`, and the resolved review prompt

#### Scenario: Subprocess starts without resolved model
- **WHEN** the extension launches the reviewer and no model can be resolved
- **THEN** the subprocess omits `--model` and allows pi to use its configured default model

#### Scenario: Subprocess completes and returns output
- **WHEN** the reviewer subprocess finishes successfully
- **THEN** the extension captures stdout, parses it as JSONL events, and extracts the final assistant message from the last assistant `message_end` event

### Requirement: Structured review output is parsed
The extension SHALL parse the reviewer's final assistant message as JSON matching the `ReviewOutputEvent` schema. If JSON parsing fails, it SHALL fall back to treating the entire output as `overall_explanation`.

The `ReviewOutputEvent` schema SHALL be:
```json
{
  "findings": [
    {
      "title": "<string>",
      "body": "<markdown string>",
      "confidence_score": 0.0,
      "priority": 2,
      "code_location": {
        "absolute_file_path": "<absolute path>",
        "line_range": { "start": 1, "end": 1 }
      }
    }
  ],
  "overall_correctness": "patch is correct",
  "overall_explanation": "<string>",
  "overall_confidence_score": 0.0
}
```

#### Scenario: Valid JSON output
- **WHEN** the reviewer returns valid `ReviewOutputEvent` JSON
- **THEN** the extension populates `findings`, `overall_correctness`, `overall_explanation`, and `overall_confidence_score`

#### Scenario: Invalid JSON output
- **WHEN** the reviewer returns plain text instead of JSON
- **THEN** the extension creates a `ReviewOutputEvent` with `overall_explanation` set to the plain text and empty `findings`

#### Scenario: JSON wrapped in surrounding text
- **WHEN** the reviewer returns text containing a valid JSON object substring
- **THEN** the extension extracts and parses the first valid object before falling back to plain text

#### Scenario: Finding priority is out of range
- **WHEN** the reviewer returns a finding priority outside `0` through `3`
- **THEN** the extension clamps or normalizes the priority to a valid value before rendering

### Requirement: Findings are rendered as custom transcript message
The extension SHALL inject a custom `supi-review` message into the session transcript with a custom renderer that displays the review banner, findings list, and overall verdict.

#### Scenario: Review has findings
- **WHEN** the review completes with one or more findings
- **THEN** the transcript shows a custom message with the review target, each finding with priority and location, and the overall correctness verdict

#### Scenario: Review has no findings
- **WHEN** the review completes with no findings
- **THEN** the transcript shows a custom message indicating the review passed with the overall explanation

### Requirement: Settings support review model configuration
The extension SHALL register `reviewFastModel`, `reviewDeepModel`, and `maxDiffBytes` settings with the SuPi settings registry.

#### Scenario: User configures fast model
- **WHEN** the user sets `reviewFastModel` to `openai/gpt-4o-mini` in settings
- **THEN** subsequent "Fast" reviews use that model

#### Scenario: User configures deep model
- **WHEN** the user sets `reviewDeepModel` to `anthropic/claude-sonnet-4-5` in settings
- **THEN** subsequent "Deep" reviews use that model

#### Scenario: No models configured
- **WHEN** no review model settings are configured
- **THEN** all depths default to the current session model

### Requirement: Non-interactive fallback runs without TUI
When `ctx.hasUI` is false, the `/review` command SHALL accept arguments to specify the target directly and skip the TUI selectors.

The non-interactive grammar SHALL be:
```text
/review base-branch <branch> [--depth inherit|fast|deep]
/review uncommitted [--depth inherit|fast|deep]
/review commit <sha> [--depth inherit|fast|deep]
/review custom [--depth inherit|fast|deep] -- <instructions...>
```

#### Scenario: Print mode reviews a base branch
- **WHEN** pi runs in print mode and the user invokes `/review base-branch main`
- **THEN** the extension resolves the base branch target and runs the reviewer without showing a TUI

#### Scenario: Print mode reviews uncommitted changes
- **WHEN** pi runs in print mode and the user invokes `/review uncommitted --depth fast`
- **THEN** the extension resolves uncommitted changes and runs the reviewer with Fast depth without showing a TUI

#### Scenario: Print mode reviews a commit
- **WHEN** pi runs in print mode and the user invokes `/review commit abc123 --depth deep`
- **THEN** the extension runs `git show abc123` and runs the reviewer with Deep depth without showing a TUI

#### Scenario: Print mode runs custom review
- **WHEN** pi runs in print mode and the user invokes `/review custom -- Focus on security regressions`
- **THEN** the extension passes `Focus on security regressions` as the review prompt without showing a TUI

#### Scenario: Print mode without arguments
- **WHEN** pi runs in print mode and the user invokes `/review` without arguments
- **THEN** the extension returns an error message explaining the required arguments

#### Scenario: Print mode with invalid arguments
- **WHEN** pi runs in print mode and the user invokes `/review unknown`
- **THEN** the extension returns an error message showing the supported grammar and does not start a review

### Requirement: Large diffs are truncated
The extension SHALL truncate diffs that exceed a configurable maximum size before passing them to the reviewer.

#### Scenario: Diff exceeds limit
- **WHEN** the computed diff is larger than `maxDiffBytes` (default 100KB)
- **THEN** the extension keeps the beginning and end of the diff, replaces the omitted middle with a `[... truncated N bytes ...]` marker, and appends a note to the reviewer prompt indicating truncation

### Requirement: Subprocess errors are handled gracefully
The extension SHALL surface subprocess failures as user-facing review errors without crashing the main pi session.

#### Scenario: pi executable cannot be found
- **WHEN** the extension cannot spawn the `pi` subprocess
- **THEN** the extension notifies the user and injects a failed `supi-review` message containing the spawn error summary

#### Scenario: Reviewer exits non-zero
- **WHEN** the reviewer subprocess exits with a non-zero status
- **THEN** the extension captures stderr/stdout, notifies the user, and injects a failed `supi-review` message containing the exit status and error summary

#### Scenario: Reviewer is aborted
- **WHEN** the user cancels the review or the command receives an abort signal
- **THEN** the extension terminates the subprocess and records the review as canceled rather than failed

#### Scenario: Reviewer times out
- **WHEN** the reviewer subprocess exceeds the configured timeout
- **THEN** the extension terminates the subprocess, notifies the user, and records the review as timed out

#### Scenario: Reviewer produces no assistant output
- **WHEN** the reviewer subprocess exits successfully but no assistant `message_end` output is found
- **THEN** the extension returns a failed review result explaining that no reviewer output was produced
