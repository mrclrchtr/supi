# supi-test-utils

Shared test utilities for SuPi extension tests. Not a pi extension — imported directly in test files.

## Exports

- `createPiMock(options?)` — returns a configurable mock `ExtensionAPI` with `Map`-captured handlers, commands, tools, renderers, entries, messages, shortcuts, and execCalls. Accepts `{ sessionName? }` options.
- `makeCtx(overrides?)` — returns a mock handler context (`ctx`) with stubbed `ui` (notify, setStatus, setTitle, setWidget, setEditorText, getEditorText, input, custom, theme), `sessionManager`, `model`, `getContextUsage`, `getSystemPrompt`, and `cwd`.
- `getTools(pi)` — returns all registered tools typed as `ToolDef[]`
- `getTool(pi, name)` — finds a tool by name, throws if not found (avoids `!` assertions that Biome prohibits)
- `ToolDef` — type for registered tools with `name`, `label`, `execute`, etc.
- `getHandler(pi, event)` — returns first handler or `undefined` (avoids `!` assertions)
- `getHandlerOrThrow(pi, event)` — returns first handler or throws if not found (avoids `!` assertions)

## Additional mock surfaces

The `createPiMock()` return value (`PiMock`) includes these captured data structures and helpers:

| Surface | Type | Description |
|---------|------|-------------|
| `handlers` | `Map<string, handler[]>` | All handlers registered via `pi.on()`, stored as arrays |
| `commands` | `Map<string, spec>` | All commands registered via `pi.registerCommand()` |
| `tools` | `unknown[]` | All tools registered via `pi.registerTool()` |
| `renderers` | `Map<string, renderer>` | Renderers registered via `pi.registerMessageRenderer()` |
| `entries` | `{ type, data }[]` | Entries appended via `pi.appendEntry()` |
| `messages` | `Record[]` | Messages sent via `pi.sendMessage()` |
| `shortcuts` | `Map<string, handler[]>` | Shortcuts registered via `pi.registerShortcut()` |
| `execCalls` | `{ command, args }[]` | Calls made via `pi.exec()` |
| `events` | `{ on, emit }` | EventBus for `pi.events.on()` / `pi.events.emit()` |
| `getHandlers(event)` | `handler[]` | Convenience accessor for event handlers |
| `getCommandHandler(name)` | `unknown` | Returns the handler function directly (extracts from spec if wrapped) |
| `getShortcutHandlers(key)` | `handler[]` | Convenience accessor for shortcut handlers |
| `emit(event, ...args)` | `Promise<void>` | Fires all registered handlers for an event, in registration order |
| `getAllTools()` | `unknown[]` | Returns the `tools` array |
| `getActiveTools()` / `setActiveTools()` | — | Active tool name tracking |

## Usage

```ts
import { createPiMock, getHandlerOrThrow, makeCtx } from "@mrclrchtr/supi-test-utils";
import { vi } from "vitest";

const pi = createPiMock({ sessionName: "my-session" });
myExtension(pi);

// Assert handlers were registered (handlers are arrays)
expect(pi.handlers.has("session_start")).toBe(true);

// Call a handler (no ! assertion — throws if handler not registered)
const handler = getHandlerOrThrow(pi, "tool_call");
await handler(mockEvent, makeCtx({ cwd: "/test" }));

// Or if the handler may not exist:
const maybeHandler = getHandler(pi, "tool_call");
await maybeHandler?.(mockEvent, makeCtx({ cwd: "/test" }));

// Fire all handlers for an event
await pi.emit("session_start", {}, makeCtx());
```

### Tool assertions

```ts
import { getTool, getTools, makeCtx } from "@mrclrchtr/supi-test-utils";
import { createPiMock } from "@mrclrchtr/supi-test-utils";

const pi = createPiMock();
myExtension(pi);

// Assert on registration (typed, no casts needed)
const tools = getTools(pi);
expect(tools).toHaveLength(2);

// Get a specific tool (throws if not found — avoids `!` assertions)
const tool = getTool(pi, "web_docs_search");

// Execute with typed result via local cast
const result = (await tool.execute(
  "tc-1",
  { library_name: "react", query: "hooks" },
  undefined,
  undefined,
  makeCtx(),
)) as { content: { type: "text"; text: string }[]; isError?: boolean };

expect(result.isError).toBe(true);
```

## Gotchas

- `handlers` stores handler **arrays** (`Map<string, handler[]>`). Prefer `getHandlerOrThrow(pi, event)` / `getHandler(pi, event)` over direct access to avoid Biome non-null assertion lint issues.
- `commands` stores the full spec object `{ handler, description }`. Use `(commands.get(name) as { handler }).handler` or `getCommandHandler(name)` to get just the handler.
- `tools` is `unknown[]` — use `getTools(pi)` / `getTool(pi, name)` for typed access instead of manual casts
- `makeCtx()` uses `...overrides` spread — passing `ui` replaces the entire `ui` object. For single-property overrides, mutate after creation: `const ctx = makeCtx(); ctx.ui.getEditorText = vi.fn(() => "text");`.
- When the code under test uses `pi.events`, the shared mock already provides it — no need to add it manually.
- `vi.mock` hoisting errors propagate from the importing module, not the test's `vi.mock` call site — check the Caused-by chain.
- In Vitest 4.x, constructor mocks inside `vi.mock` factories must use `class` — `vi.fn().mockImplementation(() => ({}))` silently returns `this`.
