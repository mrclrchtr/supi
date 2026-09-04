# Pi context architecture for extension developers

What Pi sends to the model on each request, and what that costs. Scoped to what extension authors can influence and control. This doc owns context mechanics and costs; tool design rules live in `tool-guidance.md`.

Baseline mechanics are officially documented. This doc references the installed Pi docs (§3) instead of restating them, and adds only source-verified facts that are not officially documented plus extension-specific consequences.

Evidence sources:

- Installed Pi docs: `docs/extensions.md`, `docs/compaction.md`, `docs/skills.md`, and `docs/session-format.md`.
- Installed dist source: pi-coding-agent `core/system-prompt.js` and `core/agent-session.js`; pi-ai `api/*`; pi-agent-core `harness/messages.js`.

Items marked **inferred** are not stated in Pi docs or source. Price relations follow provider prompt-caching economics. This guidance excludes user controls: the system prompt skeleton, `AGENTS.md` files, compaction settings, `/tree` and `/fork`, and `PI_CACHE_RETENTION`.

## 1. What extensions pay for — and what is free

Pi builds a complete internal `Context` for each model call. Most transports send the full context on each turn. The cached Codex WebSocket transport can send an input delta with `previous_response_id`.

Paid surfaces:

- **Active tool definitions** — Pi puts each active definition in internal `context.tools`. A definition contains a name, description, and parameter schema. Provider adapters usually send these values in a `tools` field. Deferred loading can put definitions in history. The cached Codex WebSocket transport can retain those definitions in provider context.
- **Skill metadata catalog** — `<available_skills>` XML in the system prompt: name, description, location per skill. Frontmatter limits (name 64 / description 1,024 chars) and validation in installed Pi `docs/skills.md` § Frontmatter.
- **History content** — `content` of tool results and injected custom messages; the largest growing contributor.
- **Injected messages** — custom messages (`role: "custom"`) via `pi.sendMessage()` or returned from `before_agent_start`; their `content` is sent like normal turns.

Free channels — never serialized to the model (source-verified: pi-ai `convertToolResult()` sends only `content`/`isError`; pi-agent-core `convertToLlm()` sends only custom-message `content`):

- Tool result `details` and custom message `details`.
- `pi.appendEntry(customType, data)` payloads.
- Spill files — only a path reference in `content` is paid.

Consequence: full fidelity (UI rendering, state reconstruction, bulk evidence) can live outside model context. Placement design rules: `tool-guidance.md#content-budget-and-placement`.

## 2. Cache lifecycle and billing tiers

Pi's model definitions carry four cost channels: `input`, `output`, `cacheRead`, `cacheWrite`. Relative price relations below are **inferred** from provider prompt-caching economics; exact ratios are provider- and model-specific.

**Anthropic Messages cache breakpoints:** Installed pi-ai provider code confirms three positions for ephemeral `cache_control`:

1. The system prompt blocks.
2. The last immediate tool definition.
3. The last block of the last user message.

Tool definitions carry `cache_control` only when `supportsCacheControlOnTools` permits it. The default is permitted. Deferred definitions do not carry `cache_control`. These explicit breakpoints are specific to the Anthropic Messages adapter. Other provider adapters can use different cache controls and placements.

### Tier 1 — stable prefix

On the Anthropic Messages path, the initial stable prefix contains the system prompt and the immediate tool definitions. The system prompt contains the skill catalog and context files. It also contains active `promptSnippet` and `promptGuidelines` values when Pi uses the default prompt. Deferred definitions enter later at their tool-result load point and are Tier 2.

- Billed at full input price on every cold session start and every cache miss.
- Billed at cheap `cacheRead` price on a cache hit. Cross-session reuse happens only within the provider TTL and only when the prefix is byte-identical.
- Design rule: prefix bytes are the most expensive bytes an extension adds. Keep descriptions selection-sufficient, parameter schemas call-sufficient, and prompt metadata minimal.

### Tier 2 — additions

Additions include new user and assistant messages, new tool results, and deferred definitions at their load point.

- Billed once at full input price (plus provider cache-write premium) when appended.
- Then part of the prefix on later requests: cheap on hits, re-paid in full on every later miss, retained until compaction.
- Design rule: every result byte is paid full at least once, grows every later full re-bill, and pulls compaction closer. Keep results decision-sufficient and minimal; offload bulk to free channels (§1).

### Tier 3 — cache breaks

- A change to stable-prefix bytes can cause full input billing on the next request. Examples include a changed immediate tool list or a changed system prompt. Activation with `promptSnippet` or `promptGuidelines` changes the default system prompt. A per-turn system-prompt change has the same risk. Native deferred loading can keep the initial prefix stable during additive tool activation. Official cache advice: installed Pi `docs/extensions.md` § Dynamic Tool Loading.
- Compaction and branch-summary calls use fresh routing session IDs. They also disable prompt-cache writes where the provider supports this control (official: `docs/compaction.md` Overview).
- Design rule: keep stable input unchanged. Register all tools at startup. Keep activation changes additive and rare.

## 3. Mechanics index — official Pi docs

Read these first (repo pi-docs-first rule). Locations refer to the installed Pi docs.

| Topic | Official location (`docs/…` of `@earendil-works/pi-coding-agent`) |
| --- | --- |
| Tool definition fields, `execute` contract, throw-for-failure semantics, `onUpdate`, `ctx` | `extensions.md` § Custom Tools |
| Output truncation helpers and defaults (2,000 lines / 50KB) | `extensions.md` § Output Truncation |
| Parallel execution and `withFileMutationQueue()` | `extensions.md` § Custom Tools |
| State in `details` + branch reconstruction | `extensions.md` § State Management |
| Built-in overrides: per-slot renderer inheritance, prompt-metadata non-inheritance | `extensions.md` § Overriding Built-in Tools |
| Dynamic/lazy tool loading, deferred-native models, fallback | `extensions.md` § Dynamic Tool Loading |
| `tool_call` / `tool_result` handler mechanics | `extensions.md` § Tool Events |
| Compaction triggers, cut points, summary format, 2,000-char tool-result serialization | `compaction.md` |
| Custom summaries and branch summaries via extensions | `compaction.md` § Custom Summarization via Extensions |
| Session tree, entry types, context building | `session-format.md` |
| Skill catalog, progressive disclosure, `disable-model-invocation` | `skills.md` |

## 4. Extension surfaces for context control

All surfaces are official (`docs/extensions.md`); the notes are the context-cost reading of each.

- **System prompt injection** — `before_agent_start` can return a replacement `systemPrompt` (chains across handlers) and a `message` (stored and sent). `event.systemPromptOptions` exposes the structured inputs. Part of the Tier-1 prefix: keep stable.
- **Tool prompt metadata** — Pi adds `promptSnippet` and `promptGuidelines` to the default system prompt only while the tool is active. Such activation changes Tier 1 bytes. A custom system prompt does not include these fields automatically. Design rules: `tool-guidance.md#model-facing-guidance`.
- **Dynamic tool loading** — additive `pi.setActiveTools()` during execution. Deferred-native models keep the prefix stable and load definitions at the tool-result position (Tier 2); the fallback resends the full active list and can break the prefix (Tier 3). Lazy tools should rely on `description` only and omit `promptSnippet`/`promptGuidelines`. Current model list: installed Pi `docs/extensions.md` § Models with native deferred loading.
- **History control** — the `tool_result` event rewrites output before it enters the session. Prefer moving noise from `content` to `details` over deleting information — `details` is free (§1). Spill rules: `tool-guidance.md#output-size`. The 2,000-char cut applies only during summary serialization (official: `compaction.md` § Message Serialization), not in live history.
- **Per-turn message mutation** — the `context` event fires before each LLM call and can return a replaced `messages` array (a deep copy, safe to modify). The direct hook for pruning what the model sees on a given turn.
- **Provider payload rewrite** — `before_provider_request` fires after the payload is built; returning a value replaces the payload including provider-level system instructions, `undefined` keeps it.
- **Skill discipline** — catalog entries are Tier 1; full `SKILL.md` bodies are lazy-loaded by the agent on demand. Ship short, specific descriptions; `disable-model-invocation: true` hides a skill from the catalog and forces `/skill:name`.
- **Compaction hooks** — `session_before_compact` can cancel compaction or supply a custom summary and receives `preparation.settings`; `session_before_tree` can cancel navigation or supply a branch summary and does not. Both accept arbitrary JSON in `details`.

**Session-record consequence (official: `session-format.md`):** every custom message or branch summary an extension appends is a permanent JSONL record. Only its branch path reaches the model; compaction can later summarize it. Branch navigation only moves the leaf pointer, so injected entries never corrupt other branches.

## Related docs

- `tool-guidance.md` — design rules for tools: naming, metadata budgets, placement, output limits, checklist. This doc owns the context costs of those surfaces.
- `model-call.md` — direct model calls from extensions.
