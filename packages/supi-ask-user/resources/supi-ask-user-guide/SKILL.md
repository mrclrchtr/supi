---
name: supi-ask-user-guide
description: When and how to use the ask_user tool for structured agent-user decisions — choosing question types, setting recommendations, and avoiding common pitfalls.
---

# Ask User Interaction Patterns

## Core principle

`ask_user` is for **focused decisions that require explicit human input**. It is not a substitute for reading code, investigating the codebase, or thinking through a problem.

## Choosing the question type

Always use the narrowest type that fits:

| Type | When to use | Example |
|------|------------|---------|
| `yesno` | Binary go/no-go decision | "Delete this branch?" |
| `choice` | Pick exactly one from known options | "Which test runner?" |
| `multichoice` | Pick multiple from a short list | "Which linters to enable?" |
| `text` | Freeform input genuinely needed | "Branch name?" |

Never use `text` when `choice` or `yesno` would work. Never use `choice` when `yesno` suffices.

## Setting recommendations

Set `recommendation` when one option is clearly preferable. The UI surfaces this guidance visually, helping the user decide faster.

```
recommendation: "jest"  // when Jest is the project standard
```

Do not set recommendations when options are genuinely equal.

## Using allowOther and allowDiscuss

- `allowOther: true` — only when a custom answer is genuinely useful (e.g., "Other version number"). Don't enable it for questions where the listed options are exhaustive.
  - On `multichoice`, `allowOther` is a **mutually exclusive alternative path**, not an extra custom checkbox added on top of the selected options.
- `allowDiscuss: true` — only when the user might need to talk through the choice instead of committing immediately. Good for architecture decisions, bad for "which port?".

## Using preview content

Set `preview` on options when the user would understand the choice better from code, config, or ASCII mockups than from a one-line description.

Rich sessions can show previews and richer inline interactions. Fallback UI is intentionally simpler and does not support the full rich experience, though it still supports review + revise flows, so only rely on previews when they are genuinely helpful rather than required to understand the question.

Good uses:
- Show the config file snippet for each option
- Show an ASCII mockup of a layout choice
- Show the command that will run

Bad uses:
- Repeating the description in a code block
- Long prose explanations

## Bounding the questionnaire

- **1–4 questions per call.** Fewer is better.
- Prefer one decision per call when possible.
- Group related questions only when they're tightly coupled (e.g., "Which framework?" + "Which version?").

## Concurrency rule

Never call `ask_user` while another `ask_user` interaction is in flight. Wait for the previous result before issuing the next call. The tool enforces a single-active-questionnaire lock and returns an error if a second questionnaire is attempted before the first completes.

## Optional questions

Mark individual questions as `required: false` when the user should be able to submit without answering them. Optional questions are visually distinguished in the UI and return `undefined` in the result when left unanswered.

```json
{
  "questions": [
    {
      "type": "choice",
      "id": "framework",
      "header": "Framework",
      "prompt": "Which framework?",
      "required": true,
      "options": [
        { "value": "react", "label": "React" },
        { "value": "vue", "label": "Vue" }
      ]
    },
    {
      "type": "text",
      "id": "note",
      "header": "Note",
      "prompt": "Why this choice?",
      "required": false
    }
  ]
}
```

- The user can skip the optional `note` question and still submit.
- The result includes `"note": undefined` so your code can detect it was skipped.
- Default is `required: true`; omitting the field preserves the original mandatory behavior.

## Skip action

Add `allowSkip: true` at the questionnaire level (or include at least one optional question) to expose a **Skip** action. Skip returns a partial result with `skip: true` instead of treating the interaction as cancelled.

Use skip when the user has filled in some fields but wants to bail on the rest without losing what they already entered:

```json
{
  "allowSkip": true,
  "questions": [
    { "type": "yesno", "id": "go", "header": "Go?", "prompt": "Proceed?" },
    { "type": "text", "id": "reason", "header": "Reason", "prompt": "Why?", "required": false }
  ]
}
```

- **Skip** (`s`) submits whatever is filled in and sets `skip: true` on the result.
- **Cancel** (`Esc`) aborts with no result.
- Only enable `allowSkip` when partial data is actually useful to your extension.

## Chained questionnaires

You can emit follow-up `ask_user` calls based on prior partial answers. This is useful for progressive exploration: ask a small initial set, receive the result, then conditionally ask follow-ups.

```ts
// First questionnaire
const first = await ask_user({
  questions: [
    { type: "choice", id: "scope", header: "Scope", prompt: "Pick scope", required: true,
      options: [{ value: "api", label: "API" }, { value: "ui", label: "UI" }] }
  ]
});

// Conditional follow-up based on the answer
if (first.details.answersById.scope?.value === "api") {
  await ask_user({
    questions: [
      { type: "choice", id: "format", header: "Format", prompt: "Response format?", required: true,
        options: [{ value: "json", label: "JSON" }, { value: "xml", label: "XML" }] }
    ]
  });
}
```

Keep chains short (1–2 follow-ups max) and always respect the concurrency rule: wait for each questionnaire to complete before starting the next.

## Investigation first, questions second

Before asking the user, use `read`, `bash`, `grep`, or `lsp` to investigate the codebase. A well-informed question with concrete options is better than a vague open-ended one.

Bad:
```
ask_user: "How should we handle errors?" [text]
```

Good:
```
# First: read the existing error handling patterns
read("src/errors.ts")
# Then: ask with informed options
ask_user: "Error handling strategy?" [choice]
  - "Result type (matches existing pattern)"
  - "Throw exceptions (for this new module only)"
```
