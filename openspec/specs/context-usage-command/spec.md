## Purpose

Provide a `/supi-context` command that displays a detailed, styled breakdown of what consumes the LLM context window — including system prompt components, messages, tool I/O, skills, context files, injected subdirectory files, autocompact buffer, and compaction status.

## ADDED Requirements

### Requirement: Extension registration and lifecycle
The `supi-context` extension SHALL register a `/supi-context` command and cache system prompt options from `before_agent_start` events into extension state. The cached data SHALL include `contextFiles`, `skills`, `promptGuidelines`, `customPrompt`, `toolSnippets`, and `appendSystemPrompt`. The cache SHALL be reset on `session_start`.

#### Scenario: Extension registers command on load
- **WHEN** pi loads the `supi-context` extension
- **THEN** a `/supi-context` command is registered with description "Show detailed context usage"

#### Scenario: System prompt options are cached
- **WHEN** a `before_agent_start` event fires with `systemPromptOptions`
- **THEN** the extension caches `contextFiles`, `skills`, `promptGuidelines`, `customPrompt`, `toolSnippets`, and `appendSystemPrompt`

#### Scenario: Cache resets on new session
- **WHEN** a `session_start` event fires
- **THEN** the cached system prompt options are cleared

### Requirement: API-view token analysis
The extension SHALL build the API view of the conversation using `buildSessionContext()` from pi's exports and compute per-category token estimates using `estimateTokens()`. Categories SHALL include: system prompt, user messages, assistant messages, tool calls, tool results, and other.

#### Scenario: Token estimation uses API view
- **WHEN** the `/supi-context` command runs
- **THEN** the extension calls `buildSessionContext()` with the current branch entries to get the messages the model will see, excluding compacted messages

#### Scenario: Per-category estimation with scaling
- **WHEN** `ctx.getContextUsage()` returns an actual token total
- **THEN** the extension estimates tokens per category using `estimateTokens()`, computes a scale factor (`actual / rawTotal`), and applies it to each category so the sum matches the actual total

#### Scenario: Tokens unavailable
- **WHEN** `ctx.getContextUsage()` returns `tokens: null` (e.g. right after compaction, before next LLM response)
- **THEN** the report shows "Token count pending — send a message to refresh" and falls back to unscaled estimates

#### Scenario: Context usage undefined
- **WHEN** `ctx.getContextUsage()` returns `undefined` (no model selected or no usage data)
- **THEN** the report shows unscaled estimates and notes the data is approximate

### Requirement: Visual block grid
The report SHALL include a visual block grid (20 columns × 5 rows = 100 blocks) showing proportional context usage. Filled blocks represent used categories; empty blocks represent available space plus autocompact buffer.

#### Scenario: Grid reflects usage proportions
- **WHEN** the context is 35% used
- **THEN** approximately 35 of 100 blocks are filled, colored by category

#### Scenario: Grid displays model info alongside
- **WHEN** the report is rendered
- **THEN** the grid area includes the model name, context window size, and token usage summary on the right side

### Requirement: Category breakdown section
The report SHALL include a text breakdown listing each category with its estimated token count and percentage of the context window. Categories with zero tokens MAY be omitted. An "Autocompact buffer" category SHALL show the reserve tokens from compaction settings. A "Free space" category SHALL show the remaining usable context.

#### Scenario: Non-zero categories shown
- **WHEN** system prompt uses 5.1k tokens, user messages use 12.1k, assistant uses 15.3k, tool I/O uses 9.6k
- **THEN** each category appears with its token count and percentage

#### Scenario: Autocompact buffer shown
- **WHEN** compaction settings have `reserveTokens` of 16384
- **THEN** an "Autocompact buffer" line shows "16.4k" with its percentage of the context window

#### Scenario: Autocompact buffer read from SettingsManager
- **WHEN** the user has customized compaction `reserveTokens` in their settings
- **THEN** the extension reads the value via `SettingsManager.create(ctx.cwd).getCompactionReserveTokens()` rather than using the default

### Requirement: Compaction status note
The report SHALL show a compaction note when the session has been compacted, indicating how many older turns were summarized.

#### Scenario: Compaction occurred
- **WHEN** `getLatestCompactionEntry()` returns a non-null entry
- **THEN** the report shows "↳ N older turns summarized (compaction)"

#### Scenario: No compaction
- **WHEN** `getLatestCompactionEntry()` returns null
- **THEN** no compaction note is shown

### Requirement: System prompt sub-category breakdown
The report SHALL break down the system prompt into sub-categories using cached `systemPromptOptions` fields: context files (`.contextFiles`), skills (`.skills`), guidelines (`.promptGuidelines`), tool snippets (`.toolSnippets`), and append text (`.appendSystemPrompt`). The remainder after subtracting these from the total system prompt tokens is attributed to the base prompt.

### Requirement: System prompt context files section
The report SHALL list context files loaded into the system prompt (from cached `systemPromptOptions.contextFiles`) with per-file token estimates. This section SHALL be omitted when no context files are loaded.

#### Scenario: Context files present
- **WHEN** the cached `systemPromptOptions.contextFiles` contains `AGENTS.md` (1.2k), `CLAUDE.md` (3.4k)
- **THEN** the report shows a "Context Files (system prompt)" section listing each file with its token estimate

#### Scenario: No context files
- **WHEN** the cached `systemPromptOptions.contextFiles` is empty or not yet cached
- **THEN** the "Context Files (system prompt)" section is omitted

### Requirement: Injected subdirectory context files section
The report SHALL scan tool result messages in the API view for `<extension-context source="supi-claude-md" file="..." turn="...">` blocks and list each injected file with its token estimate and injection turn. This section SHALL be omitted when no injected files are found.

#### Scenario: Injected files present
- **WHEN** tool results contain `<extension-context source="supi-claude-md" file="packages/supi-lsp/CLAUDE.md" turn="3">`
- **THEN** the report shows a "Context Files (injected · supi-claude-md)" section listing the file with its token estimate and "turn 3"

#### Scenario: No injected files
- **WHEN** no tool results contain `<extension-context source="supi-claude-md">` blocks
- **THEN** the injected context files section is omitted

### Requirement: Skills section
The report SHALL always list all loaded skills (from cached `systemPromptOptions.skills`) with per-skill token estimates. Skill token estimates SHALL be based on the formatted skill prompt text (XML `<skill>` block with name, description, and location), not just the description text length.

#### Scenario: Skills loaded
- **WHEN** 12 skills are loaded with various description lengths
- **THEN** the report shows a "Skills" section listing all 12 skills with individual token estimates

#### Scenario: No skills cached yet
- **WHEN** `systemPromptOptions` has not been cached (before first turn)
- **THEN** the skills section shows "Send a message to see skill details"

### Requirement: Guidelines and tool definitions sections
The report SHALL show a "Guidelines" line with the total estimated tokens for `promptGuidelines`. The report SHALL show a "Tool Definitions" line with the count of active tools and estimated tokens for their JSON schema definitions obtained via `pi.getActiveTools()`. Note: tool snippets (one-liners in the system prompt) are part of the system prompt sub-categories; tool definitions (full JSON schemas) are a separate API parameter.

#### Scenario: Guidelines and tools shown
- **WHEN** 5 guideline bullets and 8 active tools are loaded
- **THEN** the report shows "Guidelines" with a token estimate and "Tool Definitions (8 active)" with a token estimate

### Requirement: In-chat rendering via custom message
The `/supi-context` command SHALL send its report as a custom message (`customType: "supi-context"`) with `display: true`. A `MessageRenderer` SHALL be registered to style the output with theme-aware colors in the TUI. The report SHALL include sections from any registered context providers (via supi-core's context-provider registry), rendering each provider's data as a labeled section when data is available.

#### Scenario: Report is rendered in chat
- **WHEN** the user runs `/supi-context`
- **THEN** the report appears in the chat stream as a styled custom message

#### Scenario: Report persists in session
- **WHEN** the user scrolls back in the chat
- **THEN** previous `/supi-context` reports are visible with full styling

#### Scenario: Context provider sections rendered
- **WHEN** registered context providers return data
- **THEN** each provider's data is rendered as a labeled section in the report

#### Scenario: No context providers registered
- **WHEN** no context providers have been registered
- **THEN** no extra provider sections appear in the report

#### Scenario: Context provider returns null
- **WHEN** a registered context provider's `getData()` returns `null`
- **THEN** that provider's section is omitted from the report

### Requirement: Edge case handling
The extension SHALL handle edge cases gracefully.

#### Scenario: No model selected
- **WHEN** `ctx.model` is undefined
- **THEN** the report header shows "No model selected"

#### Scenario: Empty session
- **WHEN** no messages exist in the branch
- **THEN** the report shows system prompt and tool definitions only (if cached), with zero tokens for message categories

### Requirement: Meta-package integration
The extension SHALL be wired into the `supi` meta-package via a `packages/supi/context.ts` re-export and additions to `packages/supi/package.json` (dependency + extension entry).

#### Scenario: Extension loads via meta-package
- **WHEN** a user installs `@mrclrchtr/supi`
- **THEN** the `/supi-context` command is available
