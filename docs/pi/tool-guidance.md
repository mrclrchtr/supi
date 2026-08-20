# PI Extension Tool Guidelines

Checklist for designing, registering, and improving model-callable tools in PI extensions. Two goals: the model can select and use the tool correctly, and the tool consumes as little model context as possible.

- Context mechanics and costs (billing tiers, free channels, cache breaks): `context-architecture.md`.
- Baseline tool API: installed Pi `docs/extensions.md` of `@earendil-works/pi-coding-agent` — the primary source for mechanics, not restated here (§3 of `context-architecture.md` is the index).
- SuPi package internals (spec/guidance modules, result assembly): `../conventions/tool-architecture.md`. Transcript rendering: `../conventions/tool-rendering.md`.

## Content Budget and Placement

Context surfaces bill differently (`context-architecture.md#2-cache-lifecycle-and-billing-tiers`). Code ownership of each channel (which module holds which surface): `../conventions/tool-architecture.md` § Context channel ownership.

| Surface | Billing tier | Budget |
| --- | --- | --- |
| `description`, parameter schemas, `promptSnippet`, `promptGuidelines` | Tier 1 prefix: full price on every cold session and cache miss | Strictest — selection-sufficient only |
| Result `content` | Tier 2: full once when appended, cached after, re-paid on misses | Decision-sufficient only |
| `details`, `appendEntry`, spill files | Free — never sent to the model (`context-architecture.md#1-what-extensions-pay-for--and-what-is-free`) | Everything else lives here |

Placement rules:

1. **Selection facts** — what the model needs to choose the tool — go in `description` and parameter schemas. One home per fact, duplicates deleted: `description` owns selection rules, preconditions, and no-fallback contracts; `promptSnippet` owns one capability phrase; `promptGuidelines` owns cross-tool routing and ordering; schema field descriptions own parameter mechanics. Human docs (README, CLAUDE.md) restate behavior in their own words instead of duplicating model-facing text.
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

Mechanics of `promptSnippet` (opts into the `Available tools` list) and `promptGuidelines` (appended flat to `Guidelines` only while the tool is active): installed Pi `docs/extensions.md` § Custom Tools.

Design rules:

- Every guideline bullet must name the tool (`Use my_tool when ...`), because PI adds no heading or prefix. Parameter-style bullets also name the tool (`Pass refresh: true to code_health to recover stale diagnostics`), not just the parameter.
- Token budget is a top goal: concise, concrete, information-dense. Skip low-value hints; include negative or ordering guidance only when it materially improves tool choice or execution quality.
- Prefix metadata is Tier 1 (`context-architecture.md#2-cache-lifecycle-and-billing-tiers`): every byte is re-paid on each cold session. Nothing in metadata should belong in results or `details` instead.
- Activation churn rebuilds the prefix (Tier 3): treat shipped metadata as stable.

## Parameters

Schema basics (TypeBox `Type.Object`, `Type.Optional`, `StringEnum` from `@earendil-works/pi-ai` for Google compatibility): installed Pi `docs/extensions.md` § Tool Definition.

SuPi rules:

- Schemas are Tier 1: keep field descriptions short and prefer enums over prose enumerations. Add descriptions only to fields the model must fill.
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
- **Activation decision (Tier 3):** keep the always-on active set minimal. Rarely needed tools use the loader pattern with additive activation. Lazy tools rely on `description` only and omit `promptSnippet`/`promptGuidelines`; deferred-native models keep the prefix stable, the fallback can break it.
- New definitions added mid-session are Tier-2 additions for deferred-native models; on the fallback path they re-bill with the whole tool list.

## Shipping Checklist

- [ ] Name follows the Naming rules: snake_case, no `supi_` prefix, no unintended built-in replacement.
- [ ] `description` explains purpose, use cases, limits/side effects, and ordering — selection-sufficient, nothing more.
- [ ] `promptSnippet` is present only if the tool should appear in `Available tools`.
- [ ] `promptGuidelines` bullets explicitly name the tool.
- [ ] Each model-facing fact has exactly one home (description, guidelines, or schema field).
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
