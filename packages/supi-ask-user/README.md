<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-ask-user">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-ask-user/assets/logo.png" alt="SuPi" width="50%">
  </a>
</div>

# @mrclrchtr/supi-ask-user

SuPi Ask-User brings structured decision forms to your [pi](https://github.com/earendil-works/pi) sessions. When the agent needs your input, you get a clear, keyboard-driven form instead of a chat message.

## Install

```bash
pi install npm:@mrclrchtr/supi-ask-user
```

For local development:

```bash
pi install ./packages/supi-ask-user
```

## What to expect

During a session, the agent may pause and open a small form when it needs an explicit decision from you. The form appears directly in the TUI and blocks the agent until you respond.

Each form can contain up to ten questions. A question is either a **choice** (pick one or more from a list) or a **text** (type a short answer). The agent can suggest a recommended answer, which is preselected or prefilled for you.

All questions are expected to be answered before the form can be submitted. If you leave any question unanswered, the agent receives a "needs discussion" outcome so it can follow up.

You can also add comments to individual questions, options, or the whole form if you want to explain your thinking.

## Agent-facing behavior

`ask_user` is an interactive TUI-only handoff. The agent should use one form for one focused decision, combine related questions instead of opening multiple forms, and wait for the result before doing work that depends on your answer. Only one form can be active at a time.

The model-visible result summary is bounded to Pi's default tool-output limits: 2,000 lines or 50KB, whichever is hit first. If a very large response is truncated, the agent is told to ask a focused follow-up for any omitted text it still needs.

## Preview

<table>
  <tr>
    <td align="center">
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-ask-user/assets/ask-user-choice-preview.png" width="100%" alt="Choice question with side preview" />
      <br/>Choice question with side preview
    </td>
    <td align="center">
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-ask-user/assets/ask-user-question-comment.png" width="100%" alt="Question comment editor" />
      <br/>Question comment editor
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-ask-user/assets/ask-user-multi-choice-preview.png" width="100%" alt="Multi-select with preview" />
      <br/>Multi-select with preview
    </td>
    <td align="center">
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-ask-user/assets/ask-user-text-input.png" width="100%" alt="Text input with recommendation" />
      <br/>Text input with recommendation
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-ask-user/assets/ask-user-review-form-comment.png" width="70%" alt="Review screen with form comment" />
      <br/>Review screen with form comment
    </td>
  </tr>
</table>

## Keyboard reference

### Choice questions

| Key | Action |
|-----|--------|
| `↑` `↓` | Move between options |
| `Space` | Select / toggle an option |
| `Enter` | Confirm and advance |
| `Tab` / `→` | Next question (last question goes to review) |
| `Shift+Tab` / `←` | Previous question |
| `n` | Comment on the focused option |
| `c` | Comment on the current question |
| `u` | Mark the current question unanswered |
| `Esc` | Cancel the whole form |

### Text questions

| Key | Action |
|-----|--------|
| `Enter` | Submit text and advance |
| `Tab` | Next question |
| `Alt+C` | Comment on the current question |
| `Alt+U` | Mark the current question unanswered |
| `Esc` | Cancel the whole form |

### Review screen

| Key | Action |
|-----|--------|
| `↑` `↓` | Move between questions and Submit |
| `Enter` | Open a question for editing, or submit the form |
| `←` / `Shift+Tab` | Return to the last question |
| `c` | Edit the form-level comment |
| `Esc` | Cancel the whole form |

### Comment editors

| Key | Action |
|-----|--------|
| `Enter` | Save comment and return |
| `Esc` | Discard comment edits and return |

The recommended option is labeled `[recommended]`. On wide terminals, option previews render side-by-side with the list; on narrow terminals they stack below.
