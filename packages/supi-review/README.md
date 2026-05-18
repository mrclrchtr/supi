# @mrclrchtr/supi-review

Adds a guided `/supi-review` command to the [pi coding agent](https://github.com/earendil-works/pi) for structured code review.

## Install

```bash
pi install npm:@mrclrchtr/supi-review
```

This is a **beta** package. It is not bundled in `@mrclrchtr/supi`.

For local development:

```bash
pi install ./packages/supi-review
```

After editing the source, run `/reload`.

## What you get

After install, pi gets one command:

- `/supi-review` — launch an interactive review flow and render a structured review result

The reviewer runs in a managed child agent session with read-only review tools:

- `read`
- `grep`
- `find`
- `ls`
- `submit_review` (internal result-submission tool)

## Review flow

`/supi-review` walks you through:

1. choose a review mode
2. choose a review target
3. build a review brief
4. edit and approve the final review prompt
5. run the review with a live progress widget
6. show the result as a structured custom message
7. optionally trigger an auto-fix follow-up turn

## Review modes

### Dynamic review

You provide:

- what changed
- the intended outcome
- what the reviewer should focus on

The package turns that into a review brief and lets you edit the final prompt before the review starts.

### Standard review

You choose one of the built-in profiles:

- `general`
- `security`
- `api-maintainability`

The package builds the review brief from the selected profile and again lets you edit the final prompt before running.

## Review targets

Current target presets:

- base branch diff
- uncommitted changes
- one commit
- custom review instructions

## Result shape

A successful review includes:

- overall correctness verdict
- overall explanation
- overall confidence score
- structured findings with title, body, priority, confidence score, and code location

The renderer also handles failed, canceled, and timed-out reviews.

## Settings

This package registers a **Review** section in `/supi-settings`.

Available settings:

- `reviewModel` — preselect the model used by `/supi-review`; empty means inherit the active session model
- `maxDiffBytes` — maximum diff size before the prompt builder truncates the diff
- `autoFix` — automatically send a follow-up user message to fix findings after a successful review with findings

Defaults:

```json
{
  "review": {
    "reviewModel": "",
    "maxDiffBytes": 100000,
    "autoFix": false
  }
}
```

## Source

- `src/review.ts` — command orchestration and interactive flow
- `src/ui.ts` — TUI selection and approval steps
- `src/profiles.ts` — built-in review profiles
- `src/runner.ts` — managed reviewer session
- `src/settings.ts` — `/supi-settings` integration
- `src/renderer.ts` — structured result rendering
