# supi-test-utils

Shared test utilities for SuPi extension tests. Not a pi extension — imported directly in test files.

## API Surface

`createPiMock(options?)` captures extension registrations; `makeCtx(overrides?)` supplies a default handler context. Use accessor helpers for typed access and explicit missing-registration failures:

- `getTools(pi)` / `getTool(pi, name)` — typed tool access; `getTool` throws if not found
- `getHandler(pi, event)` → `handler | undefined` / `getHandlerOrThrow(pi, event)` → `handler`

## Usage

```ts
import { createPiMock, getHandlerOrThrow, makeCtx } from "@mrclrchtr/supi-test-utils";

const pi = createPiMock({ sessionName: "my-session" });
myExtension(pi);
expect(pi.handlers.has("session_start")).toBe(true);

// Call a handler
const handler = getHandlerOrThrow(pi, "tool_call");
await handler(mockEvent, makeCtx({ cwd: "/test" }));

// Fire all handlers
await pi.emit("session_start", {}, makeCtx());
```

## Gotchas

- `handlers` stores handler **arrays** (`Map<string, handler[]>`). Prefer `getHandlerOrThrow(pi, event)` / `getHandler(pi, event)` over direct access so missing handlers are handled explicitly.
- `commands` stores the full spec object `{ handler, description }`. Use `(commands.get(name) as { handler }).handler` or `getCommandHandler(name)` to get just the handler.
- `tools` is `unknown[]` — use `getTools(pi)` / `getTool(pi, name)` for typed access instead of manual casts
- `makeCtx()` uses `...overrides` spread — passing `ui` replaces the entire `ui` object. For single-property overrides, mutate after creation: `const ctx = makeCtx(); ctx.ui.getEditorText = vi.fn(() => "text");`.
- When the code under test uses `pi.events`, the shared mock already provides it — no need to add it manually.
- `vi.mock` hoisting errors propagate from the importing module, not the test's `vi.mock` call site — check the Caused-by chain.
- Prefer `class` for constructor mocks inside `vi.mock` factories; do not rely on an arrow-function implementation being constructible.
