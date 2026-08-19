# Pi context architecture for extension developers

What Pi sends to the model on each request, scoped to what extension authors can influence and control. Evidence comes from installed Pi 0.84.2 docs (`docs/compaction.md`, `docs/skills.md`, `docs/session-format.md`, `docs/extensions.md`) and dist source (`core/skills.js`, `core/compaction/compaction.js`, `core/session-manager.js`, pi-ai `api/anthropic-messages.js`). Items marked **inferred** are not stated in Pi docs or source. User-owned controls (system prompt skeleton, `AGENTS.md` files, compaction settings, `/tree`/`/fork`, `PI_CACHE_RETENTION`) are excluded from guidance. Their mechanics appear only where extensions can read or intercept them.

## 1. Components extensions pay for

Each request is stateless. Pi rebuilds and sends the full payload each turn. Extensions add cost in four places:

- **Tool schemas** — JSON Schema for each active tool, sent in the `tools` parameter each turn. Every extension-registered tool adds its own schema.
- **Skill metadata catalog** — `<available_skills>` XML in the system prompt: name + description + file location for each skill, including skills shipped by extension packages. The Agent Skills spec limits names to 64 chars and descriptions to 1,024 chars. Pi warns on longer values but still loads the skill without truncation. Rough guide: ~50–200 tokens for each skill (**inferred**).
- **Tool results in history** — the largest history contributor. Extension tool output stays in the growing history until compaction.
- **Injected messages** — custom messages (`role: "custom"`) injected with `pi.sendMessage()` or returned from `before_agent_start` persist in the session and are sent to the LLM like normal turns.

## 2. Per-turn vs. cached

- **Cache breakpoints (confirmed, Anthropic provider code):** pi-ai sets ephemeral `cache_control` on (1) the system prompt block, (2) the last immediate tool definition, and (3) the last block of the last user message. Tool definitions carry `cache_control` only when the model compat flag `supportsCacheControlOnTools` allows it (default: allowed). Deferred definitions carry no `cache_control`. Everything before the last breakpoint is the cache prefix. On a cache hit, only content after the last breakpoint bills as fresh input.
- **Extension actions that break the prefix:** adding or removing tools, activating a tool with `promptSnippet`/`promptGuidelines`, and per-turn system-prompt changes. `docs/extensions.md` documents all three effects. Dynamic activation adds tool definitions. The added definitions and the rebuilt prompt can each invalidate the cached prefix. The exact re-billing split on a cache hit follows from the breakpoint mechanics above.
- **History:** grows each turn. It is the growing cache-eligible prefix.
- **Lazy-loaded:** full skill instructions are **not** in the request. Only the catalog entry is. The agent loads `SKILL.md` with the `read` tool when a task matches, or on `/skill:name` (progressive disclosure, confirmed in `docs/skills.md`).
- **Cache-hostile by design:** compaction and branch-summary calls use fresh routing session IDs and disable prompt-cache writes where the provider supports it (confirmed in `docs/compaction.md`).

## 3. Compaction mechanics (what extensions need to know)

- **Trigger:** auto-compaction fires when `contextTokens > contextWindow - reserveTokens` (defaults: `reserveTokens` 16384, `keepRecentTokens` 20000, both user-configurable). Extensions read the effective settings via `preparation.settings` in the compact hook.
- **Token estimation:** last valid assistant `usage` from the provider plus a `chars / 4` estimate for later messages (conservative overestimate, images count as 4,800 chars).
- **Cut points:** cuts land on user, assistant, bashExecution, custom, or branch-summary messages — never on tool results (a result must stay with its call). Compaction entries themselves are skipped in cut-point selection. Custom extension messages are valid cut boundaries.
- **What survives:** a structured summary (Goal, Constraints, Progress, Decisions, Next Steps, Critical Context) plus cumulative `<read-files>`/`<modified-files>` path lists. Tool results are truncated to 2,000 chars during summary serialization. Exact function names and error messages have no verbatim guarantee (**inferred**).
- **JSONL is never destroyed:** compaction appends a `CompactionEntry` (`summary`, `firstKeptEntryId`, `tokensBefore`). Older entries stay in the file, unsent but intact. `docs/session-format.md` also documents an optional `retainedTail` variant that stores the kept messages directly on the entry.

## 4. Session vs. context

- **Session = the record of what happened.** Append-only JSONL. Entries form a tree via `id`/`parentId`. The session-manager source describes the store as an append-only tree and states that branching never modifies history.
- **Context = what the model needs now.** A derived, compaction-aware view: `buildContextEntries()` walks leaf → root and applies the latest `CompactionEntry`.
- **Extension consequence:** every custom message or branch summary an extension appends is a permanent session record. Only its branch path reaches the model. Compaction can later summarize it. Branch navigation only moves the leaf pointer, so injected entries never corrupt other branches.

## 5. Extension surfaces for context control

All confirmed in `docs/extensions.md`:

- **System prompt injection:** `before_agent_start` can return a `message` (custom message, stored and sent to the LLM) and a replacement `systemPrompt` that chains across handlers. `event.systemPromptOptions` exposes the structured inputs (custom prompt, active tools, snippets, guidelines, context files, skills). Changes here are part of the cached prefix.
- **Tool prompt metadata:** `pi.registerTool()` accepts `promptSnippet` (one line in `Available tools`) and `promptGuidelines` (bullets in `Guidelines`), applied only while the tool is active. Guideline bullets get no tool-name prefix. Each bullet must name its tool explicitly.
- **Dynamic/lazy tool loading:** register all tools, keep only a loader tool active, then extend with `pi.setActiveTools()` during execution. Changes must be additive. Models with native deferred loading (Anthropic Sonnet, Opus, and Fable 4.5+ except Haiku; OpenAI gpt-5.4+) keep the prefix stable. They load new definitions at the tool-result position. Other models fall back to the full active tool list. That fallback can invalidate the cache prefix. Lazy tools should rely on their `description` only and omit `promptSnippet`/`promptGuidelines`.
- **History control:** the `tool_result` event can rewrite tool output before it enters the session. Bound output at the source with truncation or spill files. The 2,000-char cut applies only during summary serialization, not in live history.
- **Per-turn message mutation:** the `context` event fires before each LLM call and can return a replaced `messages` array (a deep copy, safe to modify). This is the direct hook for pruning or rewriting what the model sees on a given turn.
- **Provider payload rewrite:** `before_provider_request` fires after the provider payload is built, right before it is sent. Returning a value replaces the payload, including provider-level system instructions. Returning `undefined` keeps the payload unchanged.
- **Skill discipline:** ship short, specific skill descriptions. Set `disable-model-invocation: true` to hide a skill from the catalog and force `/skill:name` use.
- **Compaction hooks:** `session_before_compact` can cancel compaction or supply a custom summary. `session_before_tree` can cancel navigation or supply a branch summary. Both accept arbitrary JSON in `details`. `session_before_compact` receives `preparation.settings`. `session_before_tree` does not.

## Related docs

- `tool-guidance.md` — design checklist for model-facing tool metadata, results, and rendering.
- `model-call.md` — direct model calls from extensions.
