# Tool Guidance for PI Extension Tools

This guide matches the current `pi` repo behavior: docs, types, built-in tools, and extension examples.

For SuPi's repo-specific package architecture conventions around `action-specs.ts`, `tool-specs.ts`, and deriving guidance or registration from one metadata source, see `../tool-architecture.md`.

## Recommended Tool Shape

```typescript
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

const myTool = defineTool({
  name: "my_tool",
  label: "My Tool",
  description: "What the tool does, when to use it, and any important limits or side effects.",
  promptSnippet: "One-line summary for Available tools", // optional
  promptGuidelines: [
    "Use my_tool when the user asks for ...",
  ], // optional
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),
    text: Type.Optional(Type.String({ description: "Text to add" })),
  }),
  prepareArguments(args) {
    return args;
  }, // optional
  executionMode: "sequential", // optional
  renderShell: "self", // optional

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    onUpdate?.({
      content: [{ type: "text", text: "Working..." }],
      details: { progress: 50 },
    });

    return {
      content: [{ type: "text", text: "Done" }],
      details: { result: "ok" },
      terminate: true,
    };
  },

  renderCall(args, theme, context) {
    // optional
  },

  renderResult(result, options, theme, context) {
    // optional
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(myTool);
}
```

Notes:
- `promptSnippet` is optional. Without it, the tool is still callable, but it is omitted from the default system prompt's `Available tools` section.
- `promptGuidelines` is optional. These bullets are only included while the tool is active.
- `defineTool()` is useful for standalone constants and arrays of tools. Inline `pi.registerTool({ ... })` already infers parameter types correctly.

## 1. `description` Is the Primary Tool Guidance

The model mainly decides whether to call a tool from `description`.

Write it to cover:
- what the tool does
- when to use it
- side effects or preconditions
- truncation behavior
- ordering or batching rules if correct usage depends on them

Good examples from the repo:

```typescript
description: "Manage a todo list. Actions: list, add (text), toggle (id), clear",

description: "Search file contents using ripgrep. Output is truncated to 2000 lines or 50KB (whichever is hit first). If truncated, full output is saved to a temp file.",

description: "Return a final structured answer. Use this as your last action when the user asks for structured output or a machine-readable summary.",
```

If correct use requires multiple tool calls or strict sequencing, say so explicitly in `description` and reinforce it in `promptGuidelines`.

## 2. `promptSnippet` and `promptGuidelines`

### `promptSnippet`

`promptSnippet` is a one-line summary shown in the default system prompt's `Available tools` section.

```typescript
promptSnippet: "Emit a final structured answer as a terminating tool result",
promptSnippet: "Search file contents for patterns (respects .gitignore)",
promptSnippet: "Play a tic-tac-toe action (move_up/down/left/right or play) as Player O",
```

Best practices:
- Keep it short and single-line.
- Make the tool's purpose obvious at a glance.
- Mention special scope if it matters.
- Omit it if the tool should stay callable but should not add prompt clutter.

### `promptGuidelines`

These bullets are appended flat into the default system prompt's `Guidelines` section.

Critical rule: **each bullet must name the tool explicitly**.

```typescript
promptGuidelines: [
  "Use my_tool when the user asks for ...",
  "Do not use my_tool for ...",
  "Use structured_output as your final action when the user asks for structured output.",
]
```

Best practices:
- Use `Use <tool_name> when ...`.
- Add negative guidance when needed.
- Add ordering guidance when needed.
- Keep bullets narrow and concrete.
- Do not write `Use this tool when ...` because the tool name is not added automatically.

Repo behavior to remember:
- bullets are trimmed
- empty bullets are ignored
- duplicates are deduplicated
- when overriding a built-in tool, prompt metadata is **not inherited**; define it again if you want it

## 3. Parameters: Use TypeBox, Describe Every Field, Use `StringEnum`

Use a TypeBox schema and add descriptions on fields.

```typescript
parameters: Type.Object({
  action: StringEnum(["list", "add", "toggle", "clear"] as const),
  text: Type.Optional(Type.String({ description: "Todo text (for add)" })),
  id: Type.Optional(Type.Number({ description: "Todo ID (for toggle)" })),
})
```

Best practices:
- Use `Type.Object(...)` for the main schema.
- Put `{ description: "..." }` on fields the model must fill.
- Use `Type.Optional(...)` for optional fields.
- Use `StringEnum` from `@earendil-works/pi-ai` for string enums. Do not use `Type.Union([Type.Literal(...)])` for string enums if Google compatibility matters.
- Keep the public schema strict.

## 4. `prepareArguments()` Is for Compatibility Shims

Use `prepareArguments()` to normalize old stored arguments before schema validation, especially for resumed sessions.

Do **not** add deprecated compatibility fields to `parameters` just to keep old sessions working.

```typescript
prepareArguments(args) {
  if (!args || typeof args !== "object") return args;
  const input = args as {
    action?: string;
    oldAction?: string;
  };

  if (typeof input.oldAction === "string" && input.action === undefined) {
    return { ...input, action: input.oldAction };
  }

  return args;
}
```

This hook runs:
- before schema validation
- before `execute()`

## 5. `execute()`: Return `content`, `details`, and Optionally `terminate`

Normal tool results should return:
- `content`: what the model sees
- `details`: structured data for UI, rendering, and state reconstruction
- `terminate` (optional): hint to end after the current tool batch

```typescript
async execute(_toolCallId, params, signal, onUpdate, ctx) {
  return {
    content: [{ type: "text", text: "Done" }],
    details: { data: params },
  };
}
```

Best practices:
- Keep `content` focused on what the model should know next.
- Keep `details` structured and stable if rendering or state reconstruction depends on it.
- Use `details: undefined` if there is no structured state.
- Use `onUpdate?.(...)` for partial progress on long-running tools.
- Honor `signal` and pass it through to abort-aware APIs.

Example:

```typescript
const result = await pi.exec("git", ["status"], { signal });
```

If the tool requires an interactive UI, guard with `ctx.hasUI` and return a sensible non-interactive fallback.

## 6. Signal Failures by Throwing

To mark the tool as failed, **throw** from `execute()`.

```typescript
async execute(_toolCallId, params) {
  if (!isValid(params.input)) {
    throw new Error(`Invalid input: ${params.input}`);
  }

  return {
    content: [{ type: "text", text: "OK" }],
    details: {},
  };
}
```

Do **not** rely on returning `isError: true` from `execute()`. That is not the tool result contract.

Important nuance:
- Returning a normal result that contains text like `"Error: ..."` is still a successful tool call from the runtime's point of view.
- Throw only when you want the runtime to mark the result as an actual tool failure.

## 7. `terminate: true` Has Batch Semantics

`terminate: true` is only a hint. The automatic follow-up LLM call is skipped **only when every finalized tool result in the current batch is terminating**.

```typescript
return {
  content: [{ type: "text", text: "Saved structured output" }],
  details: { ... },
  terminate: true,
};
```

Use this for tools that are the final answer, such as structured-output tools.

## 8. Branch-Aware State Belongs in `details`

For tool-owned state that must stay correct across session tree navigation, store it in tool-result `details` and reconstruct it from session history.

```typescript
interface TodoDetails {
  action: "list" | "add" | "toggle" | "clear";
  todos: Todo[];
  nextId: number;
}

pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

function reconstructState(ctx: ExtensionContext) {
  todos = [];
  nextId = 1;

  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message") continue;
    const msg = entry.message;
    if (msg.role !== "toolResult" || msg.toolName !== "todo") continue;

    const details = msg.details as TodoDetails | undefined;
    if (details) {
      todos = details.todos;
      nextId = details.nextId;
    }
  }
}
```

Use `pi.appendEntry()` for extension-specific state that should persist in the session but should not live on tool results.

Best practice: do not rely only on long tool `content` for durable state. Compaction serializes tool results aggressively, including truncating long tool-result text during summarization. Durable structured state should live in `details`.

## 9. Path Inputs: Normalize and Resolve Them

If your tool accepts file paths:
- strip a leading `@` if present
- resolve relative paths against `ctx.cwd`
- use the real resolved target path for file mutation queues

```typescript
import { resolve } from "node:path";

function normalizePathArg(path: string): string {
  return path.startsWith("@") ? path.slice(1) : path;
}

const absolutePath = resolve(ctx.cwd, normalizePathArg(params.path));
```

This mirrors built-in tool behavior closely enough for most extension tools.

## 10. File-Mutating Tools Must Use `withFileMutationQueue()`

Tool calls run in parallel by default. If your custom tool mutates files, it should participate in the same per-file queue as built-in `edit` and `write`.

Use `withFileMutationQueue()` on the actual target file path and wrap the **entire** mutation window.

```typescript
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
  const absolutePath = resolve(ctx.cwd, normalizePathArg(params.path));

  return withFileMutationQueue(absolutePath, async () => {
    await mkdir(dirname(absolutePath), { recursive: true });
    const current = await readFile(absolutePath, "utf8");
    const next = current.replace(params.oldText, params.newText);
    await writeFile(absolutePath, next, "utf8");

    return {
      content: [{ type: "text", text: `Updated ${params.path}` }],
      details: {},
    };
  });
}
```

Best practices:
- Queue read-modify-write logic, not just the final write.
- Pass the resolved absolute path, not the raw user input.
- If the tool writes a different real target than the user argument suggests, queue the real target.

## 11. Use `executionMode: "sequential"` When Order Matters

The default runtime behavior is parallel tool execution. If sibling tool calls depend on ordered shared state, set:

```typescript
executionMode: "sequential"
```

Use this for tools like games, cursors, or state machines where one tool call must finish before the next starts.

## 12. Tools Must Truncate Large Output

Custom tools should truncate output before returning it to the model.

Built-in limits are:
- `DEFAULT_MAX_LINES = 2000`
- `DEFAULT_MAX_BYTES = 50KB`

Use:
- `truncateHead()` when the beginning matters
- `truncateTail()` when the end matters

```typescript
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@earendil-works/pi-coding-agent";

const truncation = truncateHead(output, {
  maxLines: DEFAULT_MAX_LINES,
  maxBytes: DEFAULT_MAX_BYTES,
});

let resultText = truncation.content;

if (truncation.truncated) {
  const tempFile = await saveFullOutputSomewhere(output);
  resultText += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
  resultText += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
  resultText += ` Full output: ${tempFile}]`;
}
```

Best practices:
- Document truncation limits in `description`.
- Tell the model when output is truncated.
- If practical, save the full output somewhere and tell the model where to find it.
- Choose head vs tail based on the task, not by habit.

## 13. UI-Backed Tools Must Handle Non-Interactive Mode

If the tool needs user interaction, check `ctx.hasUI`.

```typescript
if (!ctx.hasUI) {
  return {
    content: [{ type: "text", text: "Error: UI not available (running in non-interactive mode)" }],
    details: { answer: null },
  };
}
```

Best practices:
- Return a clear fallback in print/RPC/non-interactive contexts.
- Use `ctx.ui.select`, `ctx.ui.confirm`, `ctx.ui.input`, or `ctx.ui.custom()` only when UI is available.

## 14. Custom Rendering: `renderCall`, `renderResult`, and `renderShell`

Use custom rendering when the generic display is not enough.

```typescript
renderCall(args, theme, context) {
  let text = theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", args.action);
  return new Text(text, 0, 0);
}

renderResult(result, { expanded, isPartial }, theme, context) {
  if (isPartial) {
    return new Text(theme.fg("warning", "Working..."), 0, 0);
  }

  if (context.isError) {
    return new Text(theme.fg("error", "Tool failed"), 0, 0);
  }

  return new Text(theme.fg("success", "Done"), 0, 0);
}
```

Best practices:
- Handle `isPartial` for streaming progress.
- Handle `expanded` for detail-on-demand.
- Use `context.isError`, not `result.isError`.
- Reuse `context.lastComponent` when updating in place makes sense.
- Use `context.state` only for state shared across call/result slots.
- If a slot renderer is defined, it must return a `Component`.

`renderShell: "self"` is for tools that want full control over framing.

```typescript
renderShell: "self"
```

If you use self-shell mode, the tool is responsible for its own framing, padding, and background behavior.

### Fallback behavior

- For ordinary custom tools with no renderer, pi uses generic fallback rendering.
- For built-in overrides, omitted `renderCall` or `renderResult` slots inherit the built-in renderer for that slot.

That distinction matters.

### If you return custom components

Follow `tui.md` rules:
- each rendered line must fit within `width`
- implement `invalidate()` correctly
- if you cache strings with theme colors baked in, rebuild them on `invalidate()` so theme changes apply

## 15. Overriding Built-in Tools

Register a tool with the same `name` as a built-in tool to replace it.

```typescript
pi.registerTool({
  name: "read",
  label: "Read (audited)",
  description: "Read files with access logging and path blocking.",
  parameters: readSchema,
  async execute(...) { ... },
});
```

Important built-in override rules:
- `promptSnippet` and `promptGuidelines` are **not inherited**.
- Rendering inheritance is per slot:
  - omit `renderCall` to use the built-in `renderCall`
  - omit `renderResult` to use the built-in `renderResult`
- If your override changes the result contract, the built-in UI may break.
- Match the built-in result shape, especially `details`, when you want built-in rendering and session logic to keep working.

## 16. Dynamic Tool Registration and Active Tools

Tools can be registered at startup or later.

```typescript
pi.on("session_start", () => {
  pi.registerTool({ name: "echo_session", ... });
});

pi.registerCommand("enable-safe-mode", {
  handler: async () => {
    pi.setActiveTools(["read", "grep", "find", "ls"]);
  },
});
```

Best practices:
- Use `pi.setActiveTools()` to control which tools shape the prompt.
- Remember that `promptSnippet` and `promptGuidelines` only affect the system prompt while the tool is active.

## 17. Practical Checklist

Before shipping a custom tool, check:

- [ ] `description` says what the tool does, when to use it, and important limits/side effects.
- [ ] `promptSnippet` is present only if the tool should appear in `Available tools`.
- [ ] `promptGuidelines` bullets explicitly name the tool.
- [ ] Every important parameter has a description.
- [ ] String enums use `StringEnum`.
- [ ] `prepareArguments()` is used only for compatibility, not schema bloat.
- [ ] `execute()` honors `signal` where applicable.
- [ ] Real failures are signaled by throwing.
- [ ] Long output is truncated.
- [ ] File-mutating tools use `withFileMutationQueue()`.
- [ ] Path-taking tools normalize leading `@` and resolve from `ctx.cwd`.
- [ ] UI-backed tools handle `ctx.hasUI === false`.
- [ ] Stateful tools store branch-aware state in `details` and reconstruct on `session_start` and `session_tree`.
- [ ] Order-dependent tools consider `executionMode: "sequential"`.
- [ ] Built-in overrides preserve prompt metadata and result shape intentionally.
- [ ] Custom renderers handle `isPartial`, `expanded`, and `context.isError`.

## Useful Repo References

Docs:
- `packages/coding-agent/docs/extensions.md`
- `packages/coding-agent/docs/tui.md`
- `packages/coding-agent/docs/compaction.md`

Core types and runtime:
- `packages/coding-agent/src/core/extensions/types.ts`
- `packages/coding-agent/src/core/system-prompt.ts`
- `packages/agent/src/types.ts`
- `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`
- `packages/coding-agent/src/core/tools/file-mutation-queue.ts`

Built-in tools:
- `packages/coding-agent/src/core/tools/read.ts`
- `packages/coding-agent/src/core/tools/bash.ts`
- `packages/coding-agent/src/core/tools/edit.ts`
- `packages/coding-agent/src/core/tools/write.ts`
- `packages/coding-agent/src/core/tools/grep.ts`
- `packages/coding-agent/src/core/tools/find.ts`
- `packages/coding-agent/src/core/tools/ls.ts`

Examples:
- `packages/coding-agent/examples/extensions/hello.ts`
- `packages/coding-agent/examples/extensions/todo.ts`
- `packages/coding-agent/examples/extensions/dynamic-tools.ts`
- `packages/coding-agent/examples/extensions/structured-output.ts`
- `packages/coding-agent/examples/extensions/truncated-tool.ts`
- `packages/coding-agent/examples/extensions/tool-override.ts`
- `packages/coding-agent/examples/extensions/built-in-tool-renderer.ts`
- `packages/coding-agent/examples/extensions/question.ts`
- `packages/coding-agent/examples/extensions/questionnaire.ts`
- `packages/coding-agent/examples/extensions/tic-tac-toe.ts`
