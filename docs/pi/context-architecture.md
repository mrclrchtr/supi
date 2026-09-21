# Pi context architecture for extension developers

What Pi sends to the model on each request, and what that costs. Scoped to what extension authors can influence and control. This doc owns context mechanics and costs; tool design rules live in `tool-guidance.md`.

Use the installed Pi docs (§3) for complete API contracts. This doc lists extension-specific rules, cost consequences, and additional source-verified facts.

Evidence sources:

- Installed Pi docs: `docs/extensions.md`, `docs/compaction.md`, `docs/skills.md`, `docs/session-format.md`, and `docs/sdk.md`.
- Context-control rules in §4–5: checked against Pi 0.87.0 docs and `core/session-manager.d.ts`.
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
- Then part of the prefix on later requests: cheap on hits, re-paid in full on every later miss. Compaction or a context edit can remove or replace that content in future requests.
- Design rule: every result byte is paid full at least once, grows every later full re-bill, and pulls compaction closer. Keep results decision-sufficient and minimal; offload bulk to free channels (§1).

### Tier 3 — cache breaks

- A change to stable-prefix bytes can cause full input billing on the next request. Examples include a changed immediate tool list or a changed system prompt. Activation with `promptSnippet` or `promptGuidelines` changes the default system prompt. A per-turn system-prompt change has the same risk. Native deferred loading can keep the initial prefix stable during additive tool activation. Official cache advice: installed Pi `docs/extensions.md` § Dynamic Tool Loading.
- Compaction and branch-summary calls use fresh routing session IDs. They also disable prompt-cache writes where the provider supports this control (official: `docs/compaction.md` Overview).
- **Inferred:** an append-only `context_edit` can still change an earlier request prefix. Less model-visible content does not guarantee a cache hit or lower cost on the next request. Compare context savings with the possible loss of cache reuse.
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
| Session tree, raw history, context edits, projected messages | `session-format.md` § ContextEditEntry and § Context Building |
| Per-request conversation and system-message changes | `extensions.md` § context and § context_with_system |
| Entry proposals and continuation at lifecycle boundaries | `extensions.md` § turn_start / turn_end and § agent_start / agent_end / agent_before_settle / agent_settled |
| Canonical session context and SDK history restoration | `sdk.md` § Agent and AgentState |
| Skill catalog, progressive disclosure, `disable-model-invocation` | `skills.md` |

## 4. Extension surfaces for context control

These surfaces are documented in `docs/extensions.md` and `docs/session-format.md`; the notes explain their context costs.

- **System prompt injection** — `before_agent_start` can return a replacement `systemPrompt` (chains across handlers) and a `message` (stored and sent). `event.systemPromptOptions` exposes the structured inputs. Part of the Tier-1 prefix: keep stable.
- **Tool prompt metadata** — Pi adds `promptSnippet` and `promptGuidelines` to the default system prompt only while the tool is active. Such activation changes Tier 1 bytes. A custom system prompt does not include these fields automatically. Design rules: `tool-guidance.md#model-facing-guidance`.
- **Dynamic tool loading** — additive `pi.setActiveTools()` during execution. Deferred-native models keep the prefix stable and load definitions at the tool-result position (Tier 2); the fallback resends the full active list and can break the prefix (Tier 3). Lazy tools should rely on `description` only and omit `promptSnippet`/`promptGuidelines`. Current model list: installed Pi `docs/extensions.md` § Models with native deferred loading.
- **Output changes before storage** — the `tool_result` event rewrites output before it enters the session. Prefer moving noise from `content` to `details` over deleting information — `details` is free (§1). Spill rules: `tool-guidance.md#output-size`. The 2,000-char cut applies only during summary serialization (official: `compaction.md` § Message Serialization), not in live history.
- **Persistent context edits** — append a `context_edit` to omit or replace an earlier message in future model context. Raw history and recorded usage stay unchanged. Use boundary entry proposals in extensions, or `appendContextEdit()` on an SDK-owned `SessionManager`. See §5 for target and branch rules.
- **Per-request conversation changes** — `context` receives a deep copy without system messages. When a handler changes the list, Pi restores the current prompt and tool declarations in a leading system message. An unchanged list keeps intermediate system messages in place. Use this hook to filter conversation content, not to remove the prompt or tools.
- **Per-request system-message changes** — `context_with_system` runs after all `context` handlers and prompt/tool restoration. It receives the full transcript. Keep a system message at index 0 and preserve the prompt sections and tool declarations carried by any removed system messages. Check the result with `getCurrentSystemPrompt()` and `getCurrentTools()` from `@earendil-works/pi-ai`. Pi does not repair this hook's returned transcript; a `systemPrompt` forced by `before_agent_start` still applies afterward.
- **Provider payload rewrite** — `before_provider_request` fires after the payload is built; returning a value replaces the payload including provider-level system instructions, `undefined` keeps it.
- **Skill discipline** — catalog entries are Tier 1; full `SKILL.md` bodies are lazy-loaded by the agent on demand. Ship short, specific descriptions; `disable-model-invocation: true` hides a skill from the catalog and forces `/skill:name`.
- **Compaction hooks** — `session_before_compact` can cancel compaction or supply a custom summary and receives `preparation.settings`; `session_before_tree` can cancel navigation or supply a branch summary and does not. Both accept arbitrary JSON in `details`.

### Boundary entries and continuation

Official rules: `docs/extensions.md` § turn_start / turn_end and § agent_start / agent_end / agent_before_settle / agent_settled.

- `turn_end` runs after assistant and tool-result entries are stored. `agent_before_settle` runs after retries, recovery, compaction, and queued work are exhausted.
- Both boundaries accept `custom`, `custom_message`, `context_edit`, and `compaction` drafts. Later handlers see earlier proposals in `event.entries` and the rebuilt context in `event.context`.
- Return `entries: [...event.entries, draft]` to preserve earlier proposals. Returning `entries` or `continue` replaces that field; omitted fields keep the current proposal. Pi validates the complete proposal before appending it in order. Storage is not transactional.
- `continue: true` ensures one next provider request. Existing tool, steering, or follow-up work can satisfy it. Otherwise, Pi makes a context-only request. Guard the condition to prevent an endless loop. Error and aborted responses remain hard exits; `continue: false` does not stop normal queued work.
- `agent_settled` is notification-only. Runs requested there start after all settled handlers finish. Do not use it as an entry-proposal boundary.

## 5. Raw history and model context

Official rules: `docs/session-format.md` § ContextEditEntry and § Context Building; `docs/sdk.md` § Agent and AgentState.

| View | Use | Context-edit behavior |
| --- | --- | --- |
| Raw entries from `getEntries()` or the active branch from `getBranch()` | History, recorded usage, durable extension state | Original targets and edit records remain available |
| `buildContextEntries()` | Entries selected for the active context after compaction | Returns raw selected entries, not edited message content |
| `buildSessionProjection()` | Model-visible messages with their source entries | Applies the latest edit for each selected target |
| `buildSessionContext()` | Finalized session messages | Uses the same projection; request hooks can still change the outgoing messages |

Context-edit rules:

- Targets can be user, assistant, tool-result, or custom-message entries. `replacement: null` omits the target. `replacement: { content }` changes only content, not its role or metadata.
- The latest edit on the active branch wins. Navigating to a point before that edit restores the earlier context contribution.
- An edit record adds no model message of its own. Its target remains in raw history, UI, exports, and usage accounting. An omission is not deletion or redaction.
- Use projected messages for context-size analysis. Keep raw usage for historical cost reports; omitting a message does not reverse its recorded cost. A current projection is not a record of every earlier provider request.
- Compaction uses the edited projection. `appendCompaction(summary, null, tokensBefore)` keeps no preceding entries and stores the compaction's own ID as `firstKeptEntryId`. Raw entries remain stored.

SDK context ownership:

- `session.sessionManager` is the source of finalized provider context. `session.agent.state.messages` is an inspection cache, not a history-restoration API.
- Restore external history with `SessionManager.inMemory(cwd, { id }, entries)` when constructing a session. Use `session.navigateTree(entryId)` for an existing session.
- After intentionally appending externally managed messages through `session.sessionManager.appendMessage(...)`, call `session.refreshContext()`.
- Extension `ctx.sessionManager` is read-only. Use boundary entry proposals for persistent context changes; do not cast it to a writable manager.

## Related docs

- `tool-guidance.md` — design rules for tools: naming, metadata budgets, placement, output limits, checklist. This doc owns the context costs of those surfaces.
- `model-call.md` — direct model calls from extensions.
