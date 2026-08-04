<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-ask-user">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-ask-user/assets/social-preview.png" alt="SuPi Ask User" width="100%">
  </a>
</div>

# @mrclrchtr/supi-ask-user — Ask-User Tool for Pi

Adds a structured ask-user tool to the [Pi coding agent](https://github.com/earendil-works/pi) for moments when it needs your input before continuing.

Instead of guessing or scattering questions across chat, the agent can pause, present one focused form, and resume with structured answers.

## What you and your agent get

- **One decision handoff** — combine up to ten related questions in one blocking form rather than interrupting repeatedly.
- **Choice and text questions** — choose one option, select several, or write a free-form answer.
- **Useful recommendations** — the agent can preselect or prefill a suggested answer without preventing you from changing it.
- **Trade-offs beside the options** — focused options can show descriptions, consequences, code samples, or other decision context.
- **Comments at every level** — explain an answer, annotate an option you selected or rejected, or leave context for the whole form.
- **Review before submission** — inspect every answer, edit any question, and see unanswered items before sending the decision back.
- **A structured outcome** — complete forms return `submitted`; forms with unanswered questions return `needs_discussion` so the agent follows up instead of assuming.

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

Completed forms are labeled `decision` in Pi's session tree. The result remains available in chat history; press `Ctrl+O` to expand it for read-only review.

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

```bash
pi install npm:@mrclrchtr/supi-ask-user
```

To try it for one run without installing:

```bash
pi -e npm:@mrclrchtr/supi-ask-user
```

## Keyboard essentials

The form always shows context-specific key hints at the bottom.

| Key | Action |
|---|---|
| `↑` `↓` | Move through choices or review rows |
| `Space` | Select a single choice or toggle a multi-select option |
| `Enter` | Accept the current answer, save text/comments, or submit from review |
| `Tab` / `Shift+Tab` | Move forward or backward between questions |
| `c` / `Alt+C` | Comment on the current question (`Alt+C` in text questions) |
| `n` | Comment on the focused choice option |
| `u` / `Alt+U` | Deliberately mark the question unanswered (`Alt+U` in text questions) |
| `Esc` | Cancel the form; inside a comment editor, discard unsaved comment edits |

On wide terminals, option details appear beside the choices; on narrow terminals, they stack underneath.

## Good to know

- `ask_user` requires Pi's interactive TUI; there is no degraded non-interactive form.
- Only one form can be active; sibling tool calls do not run beside a live form.
- Cancelling a form cancels the current agent turn rather than recording a fake answer.
- All questions are expected for a complete submission, but you can mark any question unanswered to request discussion.
- Ask User reuses your configured Pi editor for text and comments when compatible, with the default editor as a fallback.
