# Tool Guidance for PI Extension Tools

## How to Write Best Tool Guidance for PI Extension Tools

### 1. The Core Fields — Every Tool Needs These

```typescript
pi.registerTool({
  name: "my_tool",           // snake_case identifier, used in system prompt and tool_call events
  label: "My Tool",          // Human-readable display name (shown in TUI, settings, etc.)
  description: "...",        // ⭐ PRIMARY GUIDANCE — the LLM reads this to decide when to call your tool
  promptSnippet: "...",      // One-line summary in "Available tools" section
  promptGuidelines: ["..."], // Extra bullets appended to "Guidelines" section
  parameters: Type.Object({ ... }), // TypeBox schema with per-field descriptions
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    return { content: [...], details: {...} };
  },
});
```

### 2. Description — Your Most Important Field

The LLM decides whether to call your tool based on `description`. Write it like:

```typescript
description: "Manage a todo list. Actions: list, add (text), toggle (id), clear",
description: "Search file contents using ripgrep. Output is truncated to 2000 lines or 50KB (whichever is hit first).",
description: "Return a final structured answer. Use this as your last action when the user asks for structured output or a machine-readable summary.",
```

**Rules:**
- State **what** the tool does, **when** to use it, and any important **behavioral notes** (truncation, side effects)
- Keep it concise but specific enough that the LLM won't confuse it with similar tools
- Document truncation limits explicitly so the LLM knows output may be incomplete
- Mention required preconditions ("Use when the user asks for...", "Use before calling...")

### 3. promptSnippet — The One-Line Summary

This appears in the "Available tools" section of the system prompt. The LLM scans this list quickly:

```typescript
promptSnippet: "Echo back user-provided text",
promptSnippet: "Emit a final structured answer as a terminating tool result",
promptSnippet: "Summarize or transform text according to action",
```

**Rules:**
- Single line, no markdown
- Should make the tool's purpose obvious at a glance
- If your tool is only useful in specific scenarios, hint at them

### 4. promptGuidelines — The "When to Use" Rules

These are appended flat to the "Guidelines" section. **CRITICAL: each bullet must name the tool explicitly** — the LLM can't tell which tool "this" refers to:

```typescript
promptGuidelines: [
  "Use echo_session when the user asks for exact echo output.",
  "Use structured_output as your final action when the user asks for structured output, JSON-like output, or a machine-readable summary.",
  "After calling structured_output, do not emit another assistant response in the same turn.",
  "Use my_tool when the user asks to summarize previously generated text.",
],
```

**Rules:**
- Always write `"Use <tool_name> when..."` pattern
- Can include negative guidance: "Do NOT use <tool> for..."
- Can include ordering guidance: "Call <tool> before calling <other_tool>"
- Keep each bullet focused on one rule

### 5. Parameters Schema — Type Your Inputs

Use TypeBox `Type.Object()`. Every field needs `{ description: "..." }`:

```typescript
parameters: Type.Object({
  action: StringEnum(["list", "add", "toggle", "clear"] as const),
  text: Type.Optional(Type.String({ description: "Todo text (for add)" })),
  id: Type.Optional(Type.Number({ description: "Todo ID (for toggle)" })),
}),
```

**Use `Type.Optional()`** for optional parameters. The `description` is the LLM's only clue what to pass.

Import `StringEnum` from `@earendil-works/pi-ai` for Google-compatible enums.

### 6. Execute — Return Values and Truncation

Always return `{ content, details }`:

```typescript
async execute(_toolCallId, params, signal, _onUpdate, ctx) {
  return {
    content: [{ type: "text", text: "Result text here" }],
    details: {
      action: "list",
      todos: [...todos],
      nextId,
    } satisfies MyDetails,
    // Optional:
    // terminate: true,  // End the turn without a follow-up LLM call
    // isError: true,    // Mark as error
  };
}
```

**Truncation — ABSOLUTELY REQUIRED.** Custom tools MUST truncate output to avoid overwhelming LLM context:

```typescript
import { truncateHead, DEFAULT_MAX_LINES, DEFAULT_MAX_BYTES, formatSize } from "@earendil-works/pi-coding-agent";

const truncation = truncateHead(output, {
  maxLines: DEFAULT_MAX_LINES,  // 2000
  maxBytes: DEFAULT_MAX_BYTES,  // 50KB
});

// If truncated, save full output to temp file and tell the LLM
if (truncation.truncated) {
  const tempFile = join(tempDir, "output.txt");
  await writeFile(tempFile, output, "utf8");
  resultText += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines. Full output: ${tempFile}]`;
}
```

**Document truncation limits in the description** so the LLM knows what to expect.

### 7. State Management — Store in Details, Reconstruct from Session

**Do not use external files for mutable state.** Store all state in `details` of tool results:

```typescript
interface MyDetails {
  items: MyItem[];
  nextId: number;
}
```

Reconstruct on session events:

```typescript
pi.on("session_start", async (_event, ctx) => {
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "my_tool") {
      const details = entry.message.details as MyDetails | undefined;
      if (details) {
        items = details.items;
        nextId = details.nextId;
      }
    }
  }
});
```

This enables **proper branching** — when the user navigates the session tree, state is automatically correct for that point in history.

### 8. Error Handling — Return, Don't Throw

```typescript
if (!params.text) {
  return {
    content: [{ type: "text", text: "Error: text required for add" }],
    details: { action: "add", items: [...items], error: "text required" },
    isError: true,
  };
}
```

### 9. Custom Rendering — TUI Display

Provide `renderCall` and `renderResult` for a polished TUI experience:

```typescript
renderCall(args, theme, _context) {
  let text = theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", args.action);
  if (args.text) text += ` ${theme.fg("dim", `"${args.text}"`)}`;
  return new Text(text, 0, 0);
},

renderResult(result, { expanded, isPartial }, theme, _context) {
  const details = result.details as MyDetails | undefined;
  if (!details) return new Text("", 0, 0);
  // Build display from details
  return new Text(lines.join("\n"), 0, 0);
},
```

Without `renderCall`/`renderResult`, the **built-in renderer** is used (line numbers, syntax highlighting, truncation warnings for `read` tool, etc.).

### 10. terminate: true — End the Turn Early

When your tool is the final answer and no follow-up LLM call is needed:

```typescript
async execute(_toolCallId, params) {
  return {
    content: [{ type: "text", text: "Done" }],
    details: { ... },
    terminate: true,  // No follow-up assistant message
  };
}
```

### 11. prepareArguments — Compatibility Shim

For when the parameter schema has evolved:

```typescript
prepareArguments(args) {
  // Fold legacy fields into current schema
  if (args.legacyField) {
    args.modernField = args.legacyField;
    delete args.legacyField;
  }
  return args;
},
```

### 12. Overriding Built-in Tools

Register a tool with the same `name` as a built-in to replace it:

```typescript
pi.registerTool({
  name: "read",  // Same name as built-in — replaces it
  description: "Read files with access auditing. Blocks .env files.",
  parameters: readSchema,
  async execute(...) { ... },
  // No renderCall/renderResult — uses built-in renderer automatically
});
```

### 13. Dynamic Tool Registration

Tools can be registered at any time (not just during factory execution):

```typescript
pi.on("session_start", (_event, ctx) => {
  pi.registerTool({ name: "echo_session", ... });
});
pi.registerTool({ name: "dynamic_tool", ... }); // Also works after startup
```

Use `pi.setActiveTools()` to enable/disable tools at runtime.

### Summary Cheatsheet

| Concern | Best Practice |
|---------|--------------|
| **When to call** | `description` (primary) + `promptSnippet` (one-line) + `promptGuidelines` (multi-bullet) |
| **Write guidelines** | `"Use <tool_name> when..."` — always name the tool explicitly |
| **Parameters** | TypeBox with `{ description: "..." }` on every field |
| **Truncation** | ALWAYS use `truncateHead`/`truncateTail`, document limits in description |
| **Errors** | Return `{ content, details, isError: true }`, don't throw |
| **State** | Store in `details`, reconstruct from session entries |
| **TUI** | `renderCall` + `renderResult` for custom display; omit to use built-in renderer |
| **Turn end** | `terminate: true` to skip follow-up LLM call |
| **Compatibility** | `prepareArguments` for schema migration |