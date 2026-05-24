# supi-test-utils

Shared test utilities for SuPi extension tests. Not a pi extension — imported directly in test files.

## API Surface

`createPiMock(options?)` returns a `PiMock` — a configurable mock `ExtensionAPI` with captured handlers, commands, tools, renderers, entries, messages, shortcuts, and execCalls. `makeCtx(overrides?)` returns a mock handler context with stubbed `ui`, `sessionManager`, `model`, `cwd`. Utility helpers avoid `!` assertions that Biome prohibits:

- `getTools(pi)` / `getTool(pi, name)` — typed tool access; `getTool` throws if not found
- `getHandler(pi, event)` → `handler | undefined` / `getHandlerOrThrow(pi, event)` → `handler`

### PiMock properties

| Property | Type |
|----------|------|
| `handlers` | `Map<string, handler[]>` |
| `commands` | `Map<string, spec>` |
| `tools` | `unknown[]` |
| `renderers` | `Map<string, renderer>` |
| `entries` | `{ type, data }[]` |
| `messages` | `Record[]` |
| `shortcuts` | `Map<string, handler[]>` |
| `execCalls` | `{ command, args }[]` |
| `events` | `{ on, emit }` |
| `emit(event, ...args)` | Fire all handlers in registration order |
| `getAllTools()` | Returns tools array |
| `getActiveTools()` / `setActiveTools()` | Active tool name tracking |

## Usage

```ts
import { createPiMock, getHandlerOrThrow, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";

const pi = createPiMock({ sessionName: "my-session" });
myExtension(pi);
expect(pi.handlers.has("session_start")).toBe(true);

// Call a handler
const handler = getHandlerOrThrow(pi, "tool_call");
await handler(mockEvent, makeCtx({ cwd: "/test" }));

// Tool assertions
const tool = getTool(pi, "web_docs_search");
const result = (await tool.execute(
  "tc-1", { library_name: "react", query: "hooks" }, undefined, undefined, makeCtx()
)) as { isError?: boolean };
expect(result.isError).toBe(true);

// Fire all handlers
await pi.emit("session_start", {}, makeCtx());
```

## Gotchas

- `handlers` stores handler **arrays** (`Map<string, handler[]>`). Prefer `getHandlerOrThrow(pi, event)` / `getHandler(pi, event)` over direct access to avoid Biome non-null assertion lint issues.
- `commands` stores the full spec object `{ handler, description }`. Use `(commands.get(name) as { handler }).handler` or `getCommandHandler(name)` to get just the handler.
- `tools` is `unknown[]` — use `getTools(pi)` / `getTool(pi, name)` for typed access instead of manual casts
- `makeCtx()` uses `...overrides` spread — passing `ui` replaces the entire `ui` object. For single-property overrides, mutate after creation: `const ctx = makeCtx(); ctx.ui.getEditorText = vi.fn(() => "text");`.
- When the code under test uses `pi.events`, the shared mock already provides it — no need to add it manually.
- `vi.mock` hoisting errors propagate from the importing module, not the test's `vi.mock` call site — check the Caused-by chain.
- In Vitest 4.x, constructor mocks inside `vi.mock` factories must use `class` — `vi.fn().mockImplementation(() => ({}))` silently returns `this`.
