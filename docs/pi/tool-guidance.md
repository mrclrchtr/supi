# PI Extension Tool Guidelines

Guidelines for designing, registering, executing, and rendering tools in PI extensions. Use this document as a checklist for model-facing metadata, schemas, execution behavior, output limits, state handling, UI rendering, and built-in overrides.

For SuPi-specific package conventions around `action-specs.ts`, `tool-specs.ts`, and deriving registration/guidance from shared metadata, see `../tool-architecture.md`.

## Canonical Shape

```typescript
import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const myTool = defineTool({
  name: "my_tool",
  label: "My Tool",
  description: "Do X. Use when Y. Limits, side effects, and ordering rules: Z.",
  promptSnippet: "Do X for Y", // optional: one line in Available tools
  promptGuidelines: ["Use my_tool when ..."], // optional; name the tool explicitly
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const, { description: "Operation to perform" }),
    text: Type.Optional(Type.String({ description: "Text for add" })),
  }),

  // Optional legacy/resume shim. Runs before schema validation and execute().
  prepareArguments(args) {
    return args;
  },

  // Optional: use "sequential" only when sibling calls must not run concurrently.
  // executionMode: "sequential",
  // Optional: tool renders its own shell/framing.
  // renderShell: "self",

  async execute(_toolCallId, params, signal, onUpdate, ctx) {
    onUpdate?.({ content: [{ type: "text", text: "Working..." }], details: { progress: 50 } });

    return {
      content: [{ type: "text", text: `Done: ${params.action}` }],
      details: { action: params.action },
      // terminate: true, // only for final-answer tools
    };
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(myTool);
}
```

Use `defineTool()` for standalone constants, arrays, or SDK `customTools` where contextual typing would otherwise widen params. Inline `pi.registerTool({ ... })` infers parameter types.

## Model-Facing Guidance

- `description` is the main provider tool description. Include what the tool does, when to use it, preconditions, side effects, truncation, and any required sequencing/batching.
- `promptSnippet` opts a custom tool into the default system prompt's `Available tools` list. If omitted, the active tool is still callable but not listed there.
- `promptGuidelines` are appended flat to the default `Guidelines` section only while the tool is active. Each bullet must name the tool (`Use my_tool when ...`), because PI does not add a heading or prefix. Parameter-style bullets must also name the tool (`Pass refresh: true to code_health to recover stale diagnostics`), not just the parameter (`Pass refresh: true to recover stale diagnostics`).
- Token efficiency is a top goal for model-facing guidance. Treat prompt budget as scarce: make snippets/guidelines concise, concrete, and information-dense.
- Skip low-value hints. Include negative or ordering guidance only when it materially improves tool choice or execution quality.
- Built-in overrides do **not** inherit `promptSnippet` or `promptGuidelines`; redefine them intentionally.

## Parameters and Argument Compatibility

- Use a TypeBox `Type.Object(...)` schema. Add `{ description: "..." }` to fields the model must fill.
- Use `Type.Optional(...)` for optional inputs.
- Use `StringEnum` from `@earendil-works/pi-ai` for string enums; `Type.Union([Type.Literal(...)])` is not Google-compatible.
- Keep the public schema current. Do not add deprecated fields solely for old sessions.
- Use `prepareArguments(args)` to translate old stored tool-call args before validation, especially for resumed sessions. Return an object matching the current schema.
- Export a custom tool input type when other extensions/events need typed `isToolCallEventType<"tool", Input>()` checks.

## Execution Contract

`execute(toolCallId, params, signal, onUpdate, ctx)` returns an `AgentToolResult`:

- `content`: text/image blocks sent back to the model.
- `details`: structured data for UI, logs, and state reconstruction; use `details: undefined` if there is no state.
- `terminate?: true`: hint to skip the automatic follow-up LLM call **only when every finalized result in the current tool batch also terminates**.

Rules:

- Keep `content` concise and model-relevant; keep `details` stable and structured.
- Use `onUpdate?.(...)` for partial progress on long-running tools.
- Honor `signal` and pass it to abort-aware APIs (`fetch`, `pi.exec`, subprocess helpers, model calls).
- Throw from `execute()` to mark the tool result as failed (`isError: true`). Returning text like `"Error: ..."` is still a successful tool call. Valid empty outcomes (for example, no matches) should return success.
- Use `ctx.hasUI` for dialogs that work in TUI/RPC (`select`, `confirm`, `input`, `editor`, `notify`). Use `ctx.mode === "tui"` for TUI-only features such as `ctx.ui.custom()`, component factories, terminal input, and direct rendering. Return a clear fallback outside supported modes.

## Concurrency, Paths, and File Mutation

- Tool execution is parallel by default: sibling calls from one assistant message are preflighted in order, then execute concurrently. Do not assume sibling results are visible in `ctx.sessionManager` during `tool_call`.
- Set `executionMode: "sequential"` only for order-dependent shared state (games, cursors, state machines).
- For path params, strip a leading `@` and resolve relative paths from `ctx.cwd`:

```typescript
import { resolve } from "node:path";

const normalizePathArg = (path: string) => (path.startsWith("@") ? path.slice(1) : path);
const absolutePath = resolve(ctx.cwd, normalizePathArg(params.path));
```

- File-mutating tools must use `withFileMutationQueue(absolutePath, async () => { ... })` on the real resolved target path, wrapping the whole read-modify-write window. Built-in `edit`/`write` use the same per-file queue; for existing files the helper canonicalizes through `realpath()` so symlink aliases share a queue.

## Output Size

Custom tools **must truncate** large model-visible output.

- Built-in limits: `DEFAULT_MAX_LINES = 2000`, `DEFAULT_MAX_BYTES = 50KB`.
- Use `truncateHead()` when the beginning matters (file reads/search results); use `truncateTail()` when the end matters (logs/command output).
- Mention truncation limits in `description`.
- Tell the model when output was truncated and, when practical, save full output to a temp file and include that path.

## State and Session Safety

- Branch-aware tool state belongs in tool-result `details`; reconstruct it from `ctx.sessionManager.getBranch()` on `session_start` and `session_tree`.
- Use `pi.appendEntry(customType, data)` for extension state that should persist but not participate in LLM context.
- Do not rely on long tool `content` for durable state. During compaction serialization, PI truncates tool-result text to 2000 characters and summaries are lossy.

## Rendering and TUI Rules

- `renderCall(args, theme, context)` and `renderResult(result, options, theme, context)` are optional; if defined, each must return a `Component`.
- Handle `options.isPartial`, `options.expanded`, and `context.isError`. There is no `result.isError`.
- Prefer compact default views; show detail only when expanded.
- Reuse `context.lastComponent` for in-place updates when useful. Use `context.state` only for state shared across call/result render slots; read `context.args` in `renderResult` instead of duplicating args.
- `renderShell: "self"` means the tool owns its own framing, padding, and background.
- Custom components must follow `tui.md`: each rendered line fits `width`; implement `invalidate()`; if themed strings are cached, rebuild them on invalidation so theme changes apply.
- Fallbacks: ordinary custom tools use generic rendering when slots are omitted; built-in overrides inherit omitted `renderCall`/`renderResult` per slot from the built-in renderer.

## Built-ins, Dynamic Tools, and Events

Built-in tools: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`.

- Registering the same `name` replaces a built-in. Match the built-in result shape, especially `details`, if you want built-in UI/session logic to keep working.
- To wrap built-ins, delegate to `createReadTool`, `createBashTool`, `createEditTool`, `createWriteTool`, etc. Use operations interfaces for remote/sandbox execution; use `createLocalBashOperations()` for `user_bash`; use `createBashTool(..., { spawnHook })` to adjust command/cwd/env before execution.
- `pi.registerTool()` works at startup or later (`session_start`, commands, handlers); newly registered tools are refreshed immediately.
- `pi.setActiveTools(names)` controls which tools are active/callable and which prompt snippets/guidelines shape the prompt. Inspect with `pi.getActiveTools()` / `pi.getAllTools()`.
- `tool_call` handlers can block a call or mutate `event.input` before execution. Mutations are not revalidated.
- `tool_result` handlers can patch `content`, `details`, or `isError`; fields replace whole values, not deep-merge. Use `ctx.signal` for nested abort-aware work.

## Shipping Checklist

- [ ] `description` explains purpose, use cases, limits/side effects, and ordering.
- [ ] `promptSnippet` is present only if the tool should appear in `Available tools`.
- [ ] `promptGuidelines` bullets explicitly name the tool.
- [ ] Model-facing guidance is concise, information-dense, and omits low-value hints.
- [ ] Important parameters have descriptions; string enums use `StringEnum`.
- [ ] `prepareArguments()` is only a legacy compatibility shim.
- [ ] `execute()` honors `signal`, streams progress when useful, and throws for real failures.
- [ ] Long output is truncated with a clear truncation notice.
- [ ] Path tools normalize leading `@` and resolve from `ctx.cwd`.
- [ ] File-mutating tools queue the full mutation window with `withFileMutationQueue()`.
- [ ] Stateful tools persist branch-aware state in `details` and reconstruct on session events.
- [ ] UI-backed tools guard `ctx.hasUI` / `ctx.mode` correctly.
- [ ] Order-dependent tools use `executionMode: "sequential"`.
- [ ] Built-in overrides intentionally preserve or replace prompt metadata, rendering, and result shape.
- [ ] Custom renderers handle partial, expanded, error, width, and invalidation behavior.

