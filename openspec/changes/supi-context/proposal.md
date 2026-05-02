## Why

There is no way to see a detailed breakdown of what is consuming context in pi. The built-in footer only shows a compact summary (`↑94k ↓10k 16.2%/262k`). Users need visibility into what fills their context window — system prompt components, skills, context files, injected subdirectory CLAUDE.md files, messages, tool I/O — to make informed decisions about context management (compacting, switching models, adjusting skills).

## What Changes

- New `supi-context` workspace package providing a `/supi-context` command
- The command prints a styled, scrollable context usage report in-chat containing:
  - A visual block grid showing proportional usage
  - Model name and context window size
  - Token totals and percentage
  - Estimated usage by category (system prompt, messages, tool I/O, etc.)
  - Autocompact buffer reservation
  - Compaction status (summarized turns)
  - Per-file breakdown of context files (system prompt) with token estimates
  - Per-file breakdown of injected subdirectory context (supi-claude-md) with token estimates and injection turn — shown only when files have been injected
  - All loaded skills with per-skill token estimates
  - Guidelines and tool definition token estimates
- Uses pi's exported `estimateTokens`, `buildSessionContext`, and `getLatestCompactionEntry` for accurate API-view token estimation
- Caches `systemPromptOptions` from `before_agent_start` for system prompt component breakdown
- Registers a `MessageRenderer` so the report is styled and persisted in session history
- Wired into the `supi` meta-package

## Capabilities

### New Capabilities
- `context-usage-command`: The `/supi-context` command, data collection, token estimation, in-chat rendering, and meta-package integration

### Modified Capabilities

## Impact

- New package: `packages/supi-context/`
- Modified: `packages/supi/package.json` (new dependency + extension entry), `packages/supi/context.ts` (re-export wrapper)
- Dependencies: `@mrclrchtr/supi-core` (for `wrapExtensionContext` regex patterns), peer deps on `@mariozechner/pi-coding-agent` and `@mariozechner/pi-tui`
- No breaking changes to existing packages
