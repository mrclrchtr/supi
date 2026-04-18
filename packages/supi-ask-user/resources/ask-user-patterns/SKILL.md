---
name: ask-user-patterns
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
- `allowDiscuss: true` — only when the user might need to talk through the choice instead of committing immediately. Good for architecture decisions, bad for "which port?".

## Using preview content

Set `preview` on options when the user would understand the choice better from code, config, or ASCII mockups than from a one-line description.

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

Never call `ask_user` while another `ask_user` interaction is in flight. Wait for the previous result before issuing the next call. The tool enforces a single-active-questionnaire lock.

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
