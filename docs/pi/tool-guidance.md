# PI Extension Tool Guidelines

Checklist for designing, registering, and improving model-callable tools in PI extensions. Two goals: the model can select and use the tool correctly, and the tool consumes as little model context as possible.

- Context mechanics and costs (billing tiers, free channels, cache breaks): `context-architecture.md`.
- Baseline tool API: installed Pi `docs/extensions.md` of `@earendil-works/pi-coding-agent` — the primary source for mechanics, not restated here (§3 of `context-architecture.md` is the index).
- SuPi package internals (spec/guidance modules, result assembly): `../conventions/tool-architecture.md`. Transcript rendering: `../conventions/tool-rendering.md`.

## `description` vs `promptSnippet`

`description` and `promptSnippet` use different model-input channels. A snippet can summarize part of a description, but it cannot replace the description.

| Field | Model-facing destination | Presence | What to write |
| --- | --- | --- | --- |
| `description` | Pi puts it in the active provider tool definition (`context.tools`; usually the provider `tools` field). Pi does not copy it into the default `Available tools` list. | Required by `ToolDefinition`. Pi does not send the definition while the tool is inactive. | Write the compact pre-call contract. Include purpose, selection boundaries, preconditions, side effects, important limits, and all critical routing, ordering, and safety rules. Put exact argument mechanics in the parameter schema. |
| `promptSnippet` | Pi puts it in the default system prompt under `Available tools`. The format is `- <tool name>: <snippet>`. | Optional. Only an active tool with a non-empty snippet appears. Omission does not remove an active provider tool definition. | Write one short capability phrase. Add one distinguishing qualifier only when it improves selection. Do not put detailed rules or a second schema here. |
| `promptGuidelines` | Pi puts it in the default system prompt under `Guidelines` as flat bullets. | Optional and active-only. Pi does not add it when a custom system prompt replaces the default prompt. | Write optional routing, ordering, or execution reminders. Tool use must remain correct and safe when these reminders are absent. Name the tool in every bullet. |

Use these rules:

- `description` is the required pre-call contract.
- `promptSnippet` is an optional one-line catalog entry.
- `promptGuidelines` contains optional active-only reminders.

`description` does not create an `Available tools` entry. An active tool can have a description and schema without a snippet. A custom system prompt does not change the active provider tool definitions. It omits the default `Available tools` and `Guidelines` sections. Add these optional sections to the custom prompt only when they are necessary.

Example prompt fields:

```typescript
const modelFacingFields = {
  description:
    "Search file contents for a pattern. Return matching lines with file paths and line numbers. Respect .gitignore and report truncation.",
  promptSnippet: "Search file contents for patterns (respects .gitignore)",
};
```

The snippet summarizes the main capability. The description contains the pre-call contract.

## Content Budget and Placement

Context surfaces bill differently (`context-architecture.md#2-cache-lifecycle-and-billing-tiers`). Code ownership of each channel (which module holds which surface): `../conventions/tool-architecture.md` § Context channel ownership.

| Surface | Model-facing placement | Cost and budget |
| --- | --- | --- |
| `description`, parameter schemas | Active provider tool definitions | Paid model input when the tool definition is sent; exact cache placement is provider-specific. Keep the contract selection- and call-sufficient. |
| `promptSnippet` | Default system prompt, `Available tools` | Paid model input only when the tool is active and the default prompt uses it. Keep it to one line. |
| `promptGuidelines` | Default system prompt, `Guidelines` | Paid model input only when the tool is active and the default prompt uses it. Keep it to high-value bullets. |
| Result `content` | Tool-result messages | Tier 2: full once when appended, cached after, re-paid on misses. Keep it decision-sufficient. |
| `details`, `appendEntry`, spill files | Extension state and files | Free — never sent to the model (`context-architecture.md#1-what-extensions-pay-for--and-what-is-free`). |

Placement rules:

1. **Pre-call facts** belong in `description`, the parameter schema, or optional prompt metadata.
   - Put purpose, selection rules, preconditions, side effects, important limits, and all critical rules in `description`.
   - Put exact fields, enum values, cardinality, ranges, and object structure in the parameter schema.
   - Put one short capability summary in `promptSnippet`.
   - Put only noncritical routing, ordering, or execution reminders in `promptGuidelines`.
   Each detailed fact has one authoritative field. A snippet can summarize the main capability. Human docs can restate behavior without copying model-facing text.
2. **Post-call facts** — what the model needs after calling — go in result `content`, decision-first: answer and totals before evidence, compact formats (paths, counts, IDs) over dumps.
3. **Everything the model does not read** goes to free channels: `details` for state, evidence, and diagnostics (zero cost, durable, drives UI and state reconstruction); spill files for bulk output — `content` carries a short preview plus the path.
4. Never duplicate facts between `content` and `details`. Never echo input arguments or boilerplate headers back in results. Return handles and pointers instead of data the model can re-query.
5. Progressive disclosure: keep always-on guidance selection-sufficient; rare usage detail belongs on demand (result pointers, skills, docs), not in the prefix.

## Naming

PI built-in tools occupy the shared tool namespace: `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`. Registering the same `name` replaces the built-in.

SuPi naming rules:

- Lowercase snake_case.
- No `supi_` prefix in tool names. Slash commands keep the `supi-` prefix because they share one namespace with PI core commands; tool names do not need it.
- Use a domain prefix only for a family of related tools (`code_*`, `web_*`, `review_*`). Single tools use flat names (`debug`, `agent_run`, `cache_forensics`, `context_report`, `ask_user`).
- Never reuse a PI built-in name unless you intend to replace that built-in.

## Registration Shape

Definition fields, canonical example, `prepareArguments`, `StringEnum`, `executionMode`, and `renderShell`: installed Pi `docs/extensions.md` § Custom Tools and § Tool Definition.

SuPi additions:

- Use `defineTool()` for standalone constants, arrays, or SDK `customTools` where contextual typing would otherwise widen params. Inline `pi.registerTool({ ... })` infers parameter types.
- Built-in overrides: match the built-in result shape including `details`, or built-in UI/session logic breaks. Renderers inherit per omitted slot, but `promptSnippet`/`promptGuidelines` do **not** — redefine them intentionally (official: § Overriding Built-in Tools).

## Model-Facing Guidance

Mechanics of `description`, `promptSnippet`, and `promptGuidelines`: installed Pi `docs/extensions.md` § Custom Tools and § Tool Definition. The model-facing destinations are source-verified in installed Pi `dist/core/system-prompt.js` and `dist/core/agent-session.js`. Installed `@earendil-works/pi-ai` `dist/api/*` modules build the provider tool definitions.

### Tool `description`

- A `description` is required on every `ToolDefinition`.
- Write a compact pre-call contract. State what the tool does and when to select it. Include required capability, side effects, and important result limits.
- Put all critical selection, routing, ordering, and safety rules here. Tool use must remain correct when optional prompt metadata is absent.
- Keep exact fields, enum values, cardinality, and ranges in the parameter schema. The description can summarize inputs when this helps selection. Do not repeat the full schema.
- Pi sends the description with the provider tool definition. It does not send `promptSnippet` or `promptGuidelines` in that definition.

### `promptSnippet`

- Add it when the tool should appear in the default `Available tools` list.
- Write one short, noun-led or verb-led capability phrase. Add one short qualifier only when it improves selection.
- Do not put preconditions, edge cases, ordering rules, parameter syntax, or output details here. Pi converts whitespace to one line and omits an empty value.
- Omit it for a rarely used or lazily loaded tool when activation must not change the default system prompt. The active provider definition still contains its `description`.

### `promptGuidelines`

- Use this field only for optional active-tool routing, ordering, or execution reminders.
- Tool use must remain correct and safe when a guideline is absent. Put all critical behavior in `description`.
- Every bullet must name the tool because Pi adds the bullets without a tool heading. For example: `Use my_tool when ...`.
- A parameter reminder must also name the tool. For example: `Pass refresh: true to code_health to recover stale diagnostics`.
- Pi omits guidelines for inactive tools and does not add them automatically to custom system prompts.

### All model-facing fields

- Keep model-facing text concise, concrete, and information-dense. Omit low-value hints.
- Pi sends a description when it sends the active provider tool definition. Pi adds snippets and guidelines only to the default system prompt.
- When Pi uses the default prompt, activation with `promptSnippet` or `promptGuidelines` changes prefix bytes. This can invalidate the provider cache. Activation without these fields does not add tool-specific prompt text. Therefore, it does not necessarily change prefix bytes.

## Parameters

Schema basics (TypeBox `Type.Object`, `Type.Optional`, `StringEnum` from `@earendil-works/pi-ai` for Google compatibility): installed Pi `docs/extensions.md` § Tool Definition.

SuPi rules:

- Parameter schemas are paid model input when the provider sends the tool definition. Cache placement is provider-specific. Keep field descriptions short and prefer enums over prose enumerations. Add descriptions only to fields the model must fill.
- Keep the public schema current. Do not add deprecated fields solely for old sessions; use `prepareArguments(args)` as the only legacy/resume shim.
- Export a custom tool input type when other extensions/events need typed `isToolCallEventType<"tool", Input>()` checks.

## Execution and Results

Contract, throw-for-failure semantics (`isError: true`), `onUpdate` streaming, `signal` handling, `ctx.hasUI` vs `ctx.mode`: installed Pi `docs/extensions.md` § Custom Tools.

SuPi rules:

- `content` = what the model must read; `details` = everything else. `details` is never sent to the model — zero context cost — and is the durable home for UI data and branch-aware state.
- Shape results decision-first: answer/totals before evidence; totals instead of full lists when counts suffice; handles and next-step pointers instead of re-derivable data; bulk output to a spill file with preview + path in `content`.
- Valid empty outcomes (for example, no matches) return success. Throw only for real failures or capability-unavailable conditions.

## Output Size

PI does not automatically truncate custom tool output. Truncation helpers and defaults (`truncateHead`/`truncateTail`, `DEFAULT_MAX_LINES = 2000`, `DEFAULT_MAX_BYTES = 50KB`, truncation notice + full-output path): installed Pi `docs/extensions.md` § Output Truncation.

SuPi rules:

- Mention truncation limits in `description` when they affect tool choice.
- Prefer spill files over large inline output: `content` carries preview + path only (Tier 2 economy), full data stays on disk.
- `tool_result` handlers that shrink history should move noise to `details` rather than delete information.

## Paths and File Mutation

- For path params, strip a leading `@` and resolve relative paths from `ctx.cwd`:

```typescript
import { resolve } from "node:path";

const normalizePathArg = (path: string) => (path.startsWith("@") ? path.slice(1) : path);
const absolutePath = resolve(ctx.cwd, normalizePathArg(params.path));
```

- File-mutating tools participate in the shared per-file queue: `withFileMutationQueue()` semantics, `realpath()` canonicalization, and parallel-execution context: installed Pi `docs/extensions.md` § Custom Tools. Wrap the whole read-modify-write window with the resolved absolute path.

## State and Session Safety

- Branch-aware tool state belongs in tool-result `details`, reconstructed from `ctx.sessionManager.getBranch()` on `session_start` and `session_tree`: installed Pi `docs/extensions.md` § State Management.
- Use `pi.appendEntry(customType, data)` for extension state that should persist but never reach the model.
- Do not rely on long tool `content` for durable state: compaction summary serialization truncates tool results to 2,000 characters (official: `docs/compaction.md` § Message Serialization). `details` survives intact and unbilled.

## Rendering and TUI Rules

Slots (`renderCall`/`renderResult`), required option handling (`isPartial`, `expanded`, `context.isError`), fallbacks, and best practices: installed Pi `docs/extensions.md` § Custom Rendering. SuPi transcript conventions (collapsed/expanded states, `details` contract): `../conventions/tool-rendering.md`.

SuPi additions:

- Built-in overrides inherit omitted `renderCall`/`renderResult` per slot from the built-in renderer (official: § Overriding Built-in Tools).
- `renderShell: "self"` strips PI's Box (background, padding) entirely — the tool must provide its own framing. Avoid unless the tool needs full-screen control.
- Custom components follow installed Pi `docs/tui.md`: each rendered line fits `width`; implement `invalidate()`; rebuild cached themed strings on invalidation.

## Built-ins, Dynamic Tools, and Events

- To wrap built-ins, delegate to `createReadTool`, `createBashTool`, `createEditTool`, `createWriteTool`, etc. Use operations interfaces for remote/sandbox execution; use `createLocalBashOperations()` for `user_bash`; use `createBashTool(..., { spawnHook })` to adjust command/cwd/env before execution. `createBashTool` applies `commandPrefix` **before** `spawnHook`; strip the prefix manually if the hook needs the raw command.
- Registration timing, `pi.setActiveTools()` / `getActiveTools()` / `getAllTools()`, `tool_call` blocking/input mutation, `tool_result` patching: installed Pi `docs/extensions.md` (§ Custom Tools, § Dynamic Tool Loading, § Tool Events).
- **Activation decision:** keep the always-on active set minimal. Rarely needed tools use the loader pattern with additive activation. Lazy tools rely on their provider-level `description` after they load. They omit `promptSnippet` and `promptGuidelines`. Deferred-native models keep the initial prefix stable. The fallback can break it.
- New definitions added mid-session are Tier-2 additions for deferred-native models. On the fallback path, they re-bill with the full tool list.

## Shipping Checklist

- [ ] Name follows the Naming rules: snake_case, no `supi_` prefix, no unintended built-in replacement.
- [ ] `description` is the compact pre-call contract. It contains all critical selection, routing, ordering, safety, limit, and side-effect information.
- [ ] `promptSnippet` is present only if the tool should appear in the default `Available tools` list. It is one short capability phrase.
- [ ] `promptGuidelines` contains only optional active-tool reminders. Every bullet explicitly names the tool.
- [ ] Each detailed model-facing fact has one authoritative field. A snippet only summarizes the main capability.
- [ ] Model-facing guidance is concise, information-dense, and omits low-value hints.
- [ ] Result `content` holds only what the model must read; evidence, state, and bulk output live in `details` or spill files.
- [ ] No fact duplicated between `content` and `details`; inputs are not echoed in results.
- [ ] Important parameters have descriptions; string enums use `StringEnum`; schemas stay compact.
- [ ] `prepareArguments()` is only a legacy compatibility shim.
- [ ] `execute()` honors `signal`, streams progress when useful, and throws for real failures.
- [ ] Long output is truncated with a clear truncation notice, or spilled to a file with path + preview.
- [ ] Path tools normalize leading `@` and resolve from `ctx.cwd`.
- [ ] File-mutating tools queue the full mutation window with `withFileMutationQueue()`.
- [ ] Stateful tools persist branch-aware state in `details` and reconstruct on session events.
- [ ] UI-backed tools guard `ctx.hasUI` / `ctx.mode` correctly.
- [ ] Order-dependent tools use `executionMode: "sequential"`.
- [ ] Built-in overrides intentionally preserve or replace prompt metadata, rendering, and result shape.
- [ ] Custom renderers handle partial, expanded, error, width, and invalidation behavior.
- [ ] Activation set is stable; lazy tools omit prompt metadata and load additively.
