## Context

SuPi is a pi extension monorepo. Pi's built-in footer shows a compact token summary (`↑94k ↓10k 16.2%/262k`) but provides no detailed breakdown. Users have no visibility into what consumes their context window.

Pi exposes several APIs useful for context analysis:
- `ctx.getContextUsage()` → `{ tokens: number | null, contextWindow: number, percent: number | null }`
- `buildSessionContext(entries)` → `SessionContext { messages: AgentMessage[] }` (the API view)
- `getLatestCompactionEntry(branch)` → finds compaction boundary
- `estimateTokens(message)` → per-message token estimate (chars/4 heuristic)
- `ctx.getSystemPrompt()` → full system prompt string
- `systemPromptOptions` (from `before_agent_start`) → `contextFiles`, `skills`, `promptGuidelines`, `customPrompt`
- `pi.getActiveTools()` / `pi.getAllTools()` → tool definitions

supi-claude-md injects subdirectory context files into tool result content as `<extension-context source="supi-claude-md" file="..." turn="N">` blocks, not into the system prompt.

pi-tui overlays do not support scrolling, so long content (many skills, many context files) would be truncated in an overlay.

## Goals / Non-Goals

**Goals:**
- Provide a `/supi-context` command that prints a detailed, styled context usage report in-chat
- Show a visual block grid for proportional usage at a glance
- Break down token usage by category: system prompt, messages, tool I/O, skills, context files
- Show per-file token estimates for context files (system prompt) and injected subdirectory files (supi-claude-md)
- Show per-skill token estimates for all loaded skills
- Show autocompact buffer reservation and compaction status
- Use pi's API-view (post-compaction) for accurate token counts
- Persist the report in session history via custom message + renderer

**Non-Goals:**
- Interactive drill-down or expandable sections (v1)
- Persistent widget or status bar indicator
- Custom tokenizer — pi's heuristic scaled to actual total is sufficient
- Cost tracking (footer already covers this)
- MCP tools or custom agents breakdown (pi doesn't expose these)

## Decisions

### D1: In-chat print over overlay

**Decision**: Print styled text in-chat via `pi.sendMessage()` + `MessageRenderer`.

**Alternatives**:
- Overlay: pi-tui overlays don't scroll; context reports with many skills/files would be truncated
- Widget: too much data for a persistent widget

**Rationale**: In-chat output is naturally scrollable, persists in session history, and follows the pattern Claude Code uses. supi-review already demonstrates the `sendMessage` + `MessageRenderer` pattern.

### D2: API view only (post-compaction)

**Decision**: Only show messages that will be sent to the model, using `buildSessionContext(entries)`.

**Alternatives**:
- Raw branch: overcounts after compaction (pi-context's bug)
- Both views: more complex UI for marginal benefit

**Rationale**: Users care about what the model sees. Show a note about summarized turns when compaction has occurred.

### D3: Scaled estimation for per-category breakdown

**Decision**: Use pi's `estimateTokens(message)` per message, sum by category, then scale all categories proportionally to match `ctx.getContextUsage().tokens`.

**Alternatives**:
- Raw char/4 without scaling: inaccurate absolute numbers
- Provider tokenizer API: not available through pi

**Rationale**: The actual total from `getContextUsage()` is ground truth. Scaling preserves accurate proportions while matching the real number.

### D4: Cache `systemPromptOptions` from `before_agent_start`

**Decision**: Cache `systemPromptOptions` (contextFiles, skills, promptGuidelines, customPrompt) during `before_agent_start` into extension state, read it during the `/supi-context` command.

**Alternatives**:
- Parse the system prompt string: fragile, loses structure
- Re-discover resources at command time: pi doesn't expose resource discovery to commands

**Rationale**: `systemPromptOptions` is only available during `before_agent_start` but contains the exact structured data we need.

### D5: Detect supi-claude-md injections via regex

**Decision**: Scan tool result messages for `<extension-context source="supi-claude-md" file="..." turn="...">` to identify injected subdirectory context files and estimate their tokens.

**Alternatives**:
- Import supi-claude-md state directly: creates tight coupling
- Ignore them: misses a significant context contributor

**Rationale**: The `<extension-context>` format is stable (defined in supi-core), and regex extraction is simple and decoupled.

### D6: Show autocompact buffer from compaction settings

**Decision**: Read `reserveTokens` from pi's compaction settings (default 16384) and display it as a separate "Autocompact buffer" category in the grid and breakdown, following Claude Code's approach.

**Rationale**: Users need to understand that not all "available" context is usable — a portion is reserved for compaction. This prevents confusion when compaction triggers earlier than expected.

## Risks / Trade-offs

- **Token estimates are approximate** → Mitigated by scaling to the actual total; clearly labeled as "Estimated usage"
- **`systemPromptOptions` cache may be stale** → Refreshed every turn via `before_agent_start`; before first turn, show "Send a message to see full breakdown"
- **`ctx.getContextUsage().tokens` is null after compaction** → Show "Token count pending — send a message to refresh"
- **regex for `<extension-context>` could match content in user messages** → Low risk; the format includes `source="supi-claude-md"` which is unlikely to appear in user text
