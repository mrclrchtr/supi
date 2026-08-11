<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-ask-user">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-ask-user/assets/social-preview.png" alt="SuPi Ask User" width="100%">
  </a>
</div>

# @mrclrchtr/supi-ask-user — Ask-User Tool for Pi

Adds `ask_user`, a structured decision-form tool for the [Pi coding agent](https://github.com/earendil-works/pi). The agent can stop at one decision, show a keyboard form, and continue with structured answers.

## What it adds

- **One focused decision** — one blocking form contains 1-10 related questions.
- **Choice and text questions** — choose one option, choose multiple options, or enter free-form text.
- **Recommendations** — the agent can select or prefill a suggested answer. You can change it.
- **Option context** — focused options can show descriptions, trade-offs, consequences, or code samples.
- **Comments at each level** — add a form comment, a question comment, or a comment on a selected or unselected option.
- **Review before submission** — inspect each answer, edit a question, and see unanswered items.
- **Structured results** — complete forms return `submitted`. Forms with unanswered questions return `needs_discussion`.

## Example requests

You can tell Pi when you want a structured handoff:

- “Before scaffolding the project, ask me about the package manager, test runner, and linting.”
- “If you find product decisions during implementation, collect the related questions into one form.”
- “Show the trade-offs beside each migration option before I choose.”
- “Ask me which findings to fix, and let me comment on individual choices.”

The agent is also guided to use `ask_user` only after inspecting what it can inspect itself—not for status updates, broad surveys, or facts it can determine from the repository.

## How it works

1. The agent calls `ask_user` with one focused decision and related questions.
2. Pi opens a keyboard-driven form and pauses the agent.
3. You answer, comment, or deliberately mark a question unanswered.
4. The review screen lets you edit the form before submitting.
5. The agent receives ordered, structured responses and continues from your decision.

Completed forms have the `decision` label in Pi's session tree. The result remains in chat history. Use the `app.tools.expand` keybinding (`Ctrl+O` by default) to expand it for read-only review.

## See it in action

<table>
  <tr>
    <td align="center">
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-ask-user/assets/ask-user-choice-details.png" width="100%" alt="Single-choice decision with a recommendation and side-by-side details" />
      <br/>Single choice with recommendation and details
    </td>
    <td align="center">
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-ask-user/assets/ask-user-multi-choice-details.png" width="100%" alt="Multi-select decision with recommendations and side-by-side details" />
      <br/>Multi-select with recommendation and details
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-ask-user/assets/ask-user-text-input.png" width="100%" alt="Free-form text answer prefilled with a recommendation" />
      <br/>Text answer with a recommendation
    </td>
    <td align="center">
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-ask-user/assets/ask-user-question-comment.png" width="100%" alt="Question comment editor" />
      <br/>Question comment
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-ask-user/assets/ask-user-review-form-comment.png" width="70%" alt="Review screen showing answers, an unanswered question, and a form comment" />
      <br/>Review answers, comments, and unanswered questions
    </td>
  </tr>
</table>

## Install

This package is in the recommended SuPi release stack. SuPi is pre-release.

Install it globally:

```bash
pi install npm:@mrclrchtr/supi-ask-user
```

Install it for one project:

```bash
pi install npm:@mrclrchtr/supi-ask-user -l
```

Try it for one run without a persistent install:

```bash
pi -e npm:@mrclrchtr/supi-ask-user
```

## Keyboard controls

The form shows context-specific key hints at the bottom.

| Key | Action |
|---|---|
| `↑` `↓` | Move through choices or review rows |
| `Space` | Select a single choice or toggle a multi-select option |
| `Enter` | Accept an answer, save text or comments, edit a review row, or submit the form |
| `←` `→` | Move between choice questions; `←` returns from review |
| `Tab` / `Shift+Tab` | Move forward or backward between questions |
| `c` / `Alt+C` | Comment on the current question (`Alt+C` for text questions) |
| `n` | Comment on the focused choice option |
| `u` / `Alt+U` | Mark the question unanswered (`Alt+U` for text questions) |
| `Esc` | Cancel the form; in a comment editor, discard unsaved comment text |

On wide terminals, option details appear beside the choices. On narrow terminals, they appear below the choices.

## Requirements, defaults, and limits

- `ask_user` requires Pi's interactive TUI and custom component support. It does not run in RPC, JSON, or print mode.
- The package needs no additional binary, service, or API key.
- Only one form can be active. The tool uses sequential execution, so sibling tool calls do not run beside a live form.
- Cancelling a form cancels the current agent turn. It does not record a user response.
- All questions are expected for a complete submission. Mark a question unanswered to request discussion.
- A form contains 1-10 questions. A choice question contains 2-12 options with unique values.
- If a single-choice question has no recommendation, the first option is selected. A multi-select question has no selection by default.
- Titles can contain 120 characters. Headers can contain 60 characters. Intros and prompts can contain 4,000 characters. Text placeholders can contain 200 characters.
- Ask User reuses a compatible Pi custom editor for text and comments. It uses the default editor if the custom editor is not compatible.
- The model-visible result is limited to Pi's default 2,000 lines or 50 KB. The structured result remains available in the session transcript.

## Model guidance configuration

You can change the model-facing tool description, prompt snippet, and guidelines. This configuration changes the instructions that Pi sends to the model. It does not change form behavior.

Use `~/.pi/agent/supi/config.json` for global configuration or `.pi/supi/config.json` for project configuration:

```json
{
  "ask-user": {
    "tools": {
      "ask_user": {
        "promptSurface": {
          "appendPromptGuidelines": [
            "Use ask_user for release decisions that need maintainer approval."
          ]
        }
      }
    }
  }
}
```

The extension applies package defaults, then global values, then trusted project values. It ignores project prompt overrides unless Pi trusts the project and finds a trust-requiring project resource, such as `.pi/settings.json`.

`promptSurface` accepts `description`, `promptSnippet`, `promptGuidelines`, `prependPromptGuidelines`, and `appendPromptGuidelines`. Use `$reset` with an array of `description`, `promptSnippet`, or `promptGuidelines` to restore those fields to package defaults. Run `/reload` after you edit the file.

## Public API

The package also provides a headless TypeScript API. Install the package and its schema dependency with your package manager:

```bash
pnpm add @mrclrchtr/supi-ask-user typebox
```

Import the explicit API subpath:

```ts
import {
  AskUserController,
  normalizeQuestionnaire,
  type AskUserOutcome,
} from "@mrclrchtr/supi-ask-user/api";

const questionnaire = normalizeQuestionnaire({
  questions: [
    {
      type: "text",
      id: "notes",
      header: "Notes",
      prompt: "What must the agent know?",
    },
  ],
});

const controller = new AskUserController(questionnaire);
const outcome: AskUserOutcome = controller.outcome();
```

The API exports `AskUserParamsSchema`, `normalizeQuestionnaire`, `AskUserValidationError`, and `AskUserController`. It also exports types for normalized questions, responses, outcomes, tool details, and cancel or abort interaction results. The package root is not an import surface. Use `/api` for the library or `/extension` for the Pi extension entrypoint.

The package ships TypeScript source. A standalone consumer must use a runtime or build tool that can load TypeScript.

## Privacy and security

Pi stores the tool result in the session. The active model receives a text summary of answers and comments. This package does not send a separate network request or start an external process.

Like all Pi extensions, this package runs with your user permissions. Review the package source before installation.
