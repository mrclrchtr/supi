```
                 _                       _            _
 ___ _   _ _ __ (_)       ___ ___  _ __ | |_ _____  _| |_
/ __| | | | '_ \| |_____ / __/ _ \| '_ \| __/ _ \ \/ / __|
\__ \ |_| | |_) | |_____| (_| (_) | | | | ||  __/>  <| |_
|___/\__,_| .__/|_|      \___\___/|_| |_|\__\___/_/\_\\__|
          |_|
```

# @mrclrchtr/supi-context

Adds a `/supi-context` command to the [pi coding agent](https://github.com/earendil-works/pi) so you can see where your context window is going.

## Install

```bash
pi install npm:@mrclrchtr/supi-context
```

For local development:

```bash
pi install ./packages/supi-context
```

After editing the source, run `/reload`.

![Context usage report](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-context.png)

## What you get

After install, pi gets one command:

- `/supi-context` — render a detailed context-usage report for the current session

The report includes:

- model name and context-window size
- estimated or scaled total token usage
- a visual grid of used space, free space, and autocompact buffer
- token usage by category: system prompt, user messages, assistant messages, tool calls, tool results, and other
- system-prompt breakdown for context files, skills, guidelines, tool snippets, and append text

  - **Guidelines attribution** — breaks down guideline bullets by source: PI built-in defaults, known built-in tools (`read`, `write`, `edit`), and other (extensions/custom tools). Each source shows its token count and bullet count.
  - **Tool snippet breakdown** — shows per-tool one-line snippet tokens alongside definition tokens in the tool definitions section.

- injected subdirectory context files from `supi-claude-md`, including turn number and token cost
- active skills and their token cost
- tool-definition count and token cost, with per-tool snippet token column
- guideline source summary (e.g., "2 bullets from default · 1 bullet from read · 3 bullets from edit")
- compaction summary when older turns were summarized
- extra provider sections from extensions registered through the shared context-provider registry

## Notes

- The command uses the latest cached `systemPromptOptions` captured before an agent run.
- When exact usage data is not available yet, the report falls back to estimated token counts and shows an approximation note.
- The command does not add a model-callable tool; it is a user command only.

## Source

- `src/context.ts` — command registration and cached prompt-option handling
- `src/analysis.ts` — token accounting and report data
- `src/format.ts` — formatted report output
- `src/prompt-inference.ts` — model-specific context window detection
- `src/renderer.ts` — custom message renderer for the report
- `src/utils.ts` — token formatting helpers

Tests live under `__tests__/unit/`.
