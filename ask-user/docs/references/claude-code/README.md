# Claude Code `AskUserQuestion` Reference

Screenshots and API notes captured from Claude Code's native `AskUserQuestion` tool for comparison with `ask-user`'s implementation.

## API Shape (from Claude Code)

```
AskUserQuestion({
  questions: [{
    question: string,          // Full question text
    header: string,            // Short chip label
    options: [{
      label: string,           // Display text
      description?: string,    // One-line clarification
      preview?: string,        // Multi-line content (markdown, code, ASCII mockups)
    }],
    multiSelect?: boolean,     // Allow multiple selections (checkboxes)
  }, ...],                     // 1–4 questions per call

  // Not per-question; set at the tool level
  // previews default ON for single-option questions
})
```

### Key differences from `ask-user`

| Feature | Claude Code | `ask-user` |
|---|---|---|
| Question types | Implicit (choice only) | Explicit: `choice`, `yesno`, `text` |
| Recommendations | Via `(Recommended)` suffix in label | `recommendation` field, rendered as `★` marker |
| Option previews | `preview` field on options, side-by-side layout | Not yet implemented |
| Multi-select | `multiSelect: true`, checkbox UI | Not yet implemented |
| Free-form "Other" | Always present ("Type something" / "Chat about this") | Always present (`Other` option with editor) |
| Notes/annotations | Per-tool-call, not per-question | Per-question notes via `n` shortcut |
| Review screen | Multi-select has inline review before submit | Dedicated review tab for multi-question flows |
| Text questions | Not supported | Supported (`type: "text"`) |
| Yes/No | Not a separate type | Dedicated `yesno` type with recommendation |

## Advanced Features (Screenshots)

### Option Previews — Side-by-Side Layout

Claude Code renders option previews in a **split panel**: options list on the left, preview content on the right. The preview updates as the user navigates between options.

- **[01-mockup-preview-bordered-card.png](01-mockup-preview-bordered-card.png)** — ASCII mockup preview showing a bordered card component layout
- **[02-mockup-preview-grid-layout.png](02-mockup-preview-grid-layout.png)** — ASCII mockup preview showing a grid layout (second option selected)

Preview content is rendered as **markdown in a monospace box**. Supports:
- ASCII mockups (component layouts, wireframes)
- Code snippets (syntax-highlighted)
- Configuration examples (JSON, YAML)

### Code Snippet Previews

- **[04-code-snippet-preview-zod.png](04-code-snippet-preview-zod.png)** — Zod schema code snippet shown alongside schema library options
- **[07-config-code-preview.png](07-config-code-preview.png)** — JSON config file preview (`.pi-lsp.json` style)

The preview panel renders code with syntax highlighting and preserves indentation. Each option can show different code (e.g., comparing Zod vs TypeBox vs plain JSON Schema).

### Multi-Select

- **[05-multi-select-checkboxes.png](05-multi-select-checkboxes.png)** — Checkbox-based multi-select UI with descriptions
- **[06-multi-select-review-screen.png](06-multi-select-review-screen.png)** — Review screen before submission showing all selected answers

Multi-select uses checkboxes (`✓` / `[ ]`) instead of radio-style single selection. A "Submit" button replaces "Enter to select". The footer shows `Enter to select • ↑/↓ to navigate • Esc to cancel`.

## Result Format

Claude Code returns answers in a flat structure:

```
{
  answers: {
    "<question-id>": "<selected-value>" | string,  // for single-select
    // for multi-select: array of selected values
  },
  notes?: string  // free-text notes if the user typed in "Chat about this"
}
```

`ask-user` returns a richer structured result:

```
{
  content: [{ type: "text", text: "Header: answer text" }],
  details: {
    questions: NormalizedQuestion[],
    answers: Answer[],
    answersById: Record<string, Answer>,
    terminalState: "submitted" | "cancelled" | "aborted"
  }
}
```

Where each `Answer`:
```
{
  questionId: string,
  source: "option" | "other" | "text" | "yesno",
  value: string,
  optionIndex?: number,
  comment?: string
}
```

## Constraints

| | Claude Code | `ask-user` |
|---|---|---|
| Questions per call | 1–4 | 1–4 |
| Options per question | 2–4 observed | 2–8 |
| Header length | ~12 chars observed | 40 chars max |
| Prompt length | ~200 chars observed | 240 chars max |
