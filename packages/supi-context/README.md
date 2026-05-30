<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-context">
    <picture>
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-context/assets/logo.png" alt="SuPi" width="50%">
    </picture>
  </a>
</div>

# @mrclrchtr/supi-context

Adds a `/supi-context` command to the [pi coding agent](https://github.com/earendil-works/pi) so you can inspect how the current session is spending its context window.

## Install

```bash
pi install npm:@mrclrchtr/supi-context
```

For local development:

```bash
pi install ./packages/supi-context
```

![Context usage report](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-context.png)

## What you get

After install, pi gets one user command:

- `/supi-context` — render a detailed context-usage report for the current session
- `/supi-context full` — render the same report with the full guideline and tool-definition lists instead of previews

The command sends a custom `supi-context` message, and this package registers a dedicated renderer so the report shows up as a structured TUI view instead of plain text.

## What the report shows

The report is meant to answer questions like:

- what is taking up space in the current context window?
- how much room is left before compaction pressure gets worse?
- which instruction files, context files, skills, guidelines, or tools are expensive?
- what extra context was injected by other SuPi extensions?

It includes:

- model name, context-window size, and total token usage
- approximation or pending-usage notes when exact usage data is not available yet
- a visual usage bar for system prompt, user messages, assistant messages, tool calls, tool results, other, autocompact buffer, and free space
- a category breakdown table for the same usage buckets
- a system-prompt composition breakdown for:
  - base prompt content
  - instruction files (`AGENTS.md`, `CLAUDE.md`, etc.)
  - other context files loaded into the system prompt
  - active skills
  - guidelines
  - tool snippets
  - append text
- instruction-file details with token cost, line count, and detected origin (`project` vs `global`)
- injected subdirectory context files from `supi-claude-md`, including turn number, line count, and token cost
- active skill names with per-skill token counts
- guideline bullet previews, plus source attribution for PI defaults, known built-in tools (`read`, `write`, `edit`), and `other`
- active tool definitions with per-tool definition token counts and snippet-token columns when available
- a compaction note when older turns were summarized
- extra provider sections from extensions registered through the shared context-provider registry in `@mrclrchtr/supi-core`

## Configuration

No settings are required.

This package does not add a model-callable tool; it adds a user command only.

## Notes

- The command uses the latest cached `systemPromptOptions` captured during `before_agent_start`.
- If those prompt options are missing or incomplete, the package backfills context files and skills by re-parsing the current system prompt.
- Exact totals come from pi's current context-usage data when available. Otherwise the report falls back to rough estimates and/or scales estimated category totals to the latest measured total.
- If no model is selected yet, the report can still render, but the context-window bar cannot show capacity.

## Source

- `src/context.ts` — command registration, cached prompt-option handling, and renderer wiring
- `src/analysis.ts` — token accounting, attribution, and report data assembly
- `src/format.ts` — report orchestration for the TUI view
- `src/format-helpers.ts` — shared numeric and category helpers for report rendering
- `src/format-summary.ts` — summary, usage bar, category, and composition sections
- `src/format-sections.ts` — instruction file, context file, skill, guideline, tool, compaction, and provider sections
- `src/prompt-inference.ts` — fallback recovery of context files, skills, and guideline sections from the live system prompt
- `src/renderer.ts` — custom renderer for `supi-context` messages
- `src/utils.ts` — token and plural-format helpers

Tests live under `__tests__/unit/`.
