<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-context">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-context/assets/social-preview.png" alt="SuPi Context" width="100%">
  </a>
</div>

# @mrclrchtr/supi-context — Context Window and Token Usage Monitor for Pi

Adds context window and token usage monitoring to the [Pi coding agent](https://github.com/earendil-works/pi).

## Install

```bash
pi install npm:@mrclrchtr/supi-context
```

For local development:

```bash
pi install ./packages/supi-context
```

## Two concepts, two surfaces

- A **Context Pressure Snapshot** is a small point-in-time capacity reading for deciding whether a session has room for another operation.
- A **Context Usage Report** is a diagnostic account of where the session's context is spent.

### Human: Context Usage Report

In interactive TUI mode, pi gets these commands:

- `/supi-context` — render a report with guideline and tool previews
- `/supi-context full` — render the same report with complete guideline and tool lists

The command appends a durable `supi-context` custom entry and uses a dedicated entry renderer. The report remains in the transcript but never enters LLM context.

### Agent: Context Pressure Snapshot

`context_report` is agent-callable when enabled in configuration. It defaults to a one-line, constant-shape JSON **Context Pressure Snapshot**:

```ts
interface ContextPressureSnapshot {
  modelName: string;
  contextWindow: number | null;
  usedTokens: number;
  usagePercent: number | null;
  compactionEnabled: boolean;
  reserveTokens: number;
  headroomTokens: number | null;
  pressurePercent: number | null;
  compacted: boolean;
  approximationNote: string | null;
}
```

Use `context_report({ mode: "full" })` only when diagnostic attribution is needed. Full mode returns compact JSON for the Context Usage Report. If it exceeds Pi's normal tool-output limits, it returns a small valid-JSON envelope with the path to a temporary file containing the complete report.

The tool TUI never shows raw agent JSON: concise results render as a dense snapshot that expands into its metrics; full results expand into the diagnostic report.

## What the report shows

The Context Usage Report includes:

- model name, context-window size, used tokens, usage percentage, pressure percentage, and **Headroom**
- the effective **Compaction reserve** and factual presence of compaction on the active branch
- approximation or pending-usage notes when exact usage is not available
- a visual usage bar and attribution-category breakdown for system prompt, messages, tool calls, tool results, and other context
- system-prompt composition, instruction/context files, skills, guideline sources, tool definitions, injected files, and registered provider sections

## Configuration

The human `/supi-context` command needs no configuration.

To enable the agent-callable `context_report` tool, set `agentToolEnabled` to `true` in your supi config:

```json
{
  "supi-context": {
    "agentToolEnabled": true
  }
}
```

Or toggle it via `/supi-settings` → **Context** → **Agent Tool**, then `/reload`.

The tool is disabled by default and requires a `/reload` or restart after toggling.

## Notes

- The extension caches the latest `systemPromptOptions` from `before_agent_start`. If those are missing or incomplete, it backfills context files and skills from the current system prompt.
- Exact usage comes from Pi's current context-usage data when available. Otherwise the extension estimates usage and preserves an approximation note.
- The Active Context Limit is the auto-compaction threshold while auto-compaction is enabled, otherwise the raw model context window. Headroom and pressure use that limit.

## Source

- `src/context.ts` — surface registration and cached prompt-option handling
- `src/capacity.ts` — shared capacity analysis and snapshot shape
- `src/analysis.ts` — diagnostic attribution and report data assembly
- `src/entry-renderer.ts` — TUI-only custom-entry renderer for the human command
- `src/format*.ts` and `src/report-component.ts` — Context Usage Report rendering
- `src/snapshot-component.ts` — compact, width-safe snapshot rendering
- `src/tool/guidance.ts`, `src/tool/output.ts`, and `src/tool/render.ts` — agent-tool guidance, safe full JSON output, and tool rendering

Tests live under `__tests__/unit/`.
