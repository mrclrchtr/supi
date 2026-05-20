# @mrclrchtr/supi-test-utils

Shared test helpers for SuPi extension packages.

This is a **workspace-internal** package (`"private": true`). It is meant for tests inside this repo, not for `pi install`.

## What it exports

- `createPiMock()` — mock `ExtensionAPI` with captured handlers, commands, tools, renderers, shortcuts, messages, entries, event-bus handlers, and exec calls
- `makeCtx()` — minimal mock handler context with easy overrides
- `getHandler()` / `getHandlerOrThrow()` — fetch registered `pi.on(...)` handlers from the mock
- `getTools()` / `getTool()` — inspect registered tools with typed helpers
- `ToolDef` — simple tool type used by the tool helpers

## `createPiMock()`

Use this when testing extension wiring.

```ts
import { createPiMock } from "@mrclrchtr/supi-test-utils";

const pi = createPiMock();
myExtension(pi as unknown as ExtensionAPI);

expect(pi.handlers.has("session_start")).toBe(true);
expect(pi.tools.length).toBe(1);
```

Useful captured state on the returned mock includes:

- `handlers`
- `commands`
- `tools`
- `renderers`
- `entries`
- `messages`
- `shortcuts`
- `execCalls`

It also provides helper methods such as:

- `emit(event, ...)`
- `getHandlers(event)`
- `getCommandHandler(name)`
- `getShortcutHandlers(key)`
- `getExecCalls()`

## `makeCtx(overrides?)`

Use this when testing handlers directly.

```ts
import { makeCtx } from "@mrclrchtr/supi-test-utils";

const ctx = makeCtx({ cwd: "/other" });
await handler("args", ctx);
```

The default mock context includes:

- `cwd`
- `model`
- a mocked `ui` object
- a mocked `sessionManager.getBranch()`
- `getContextUsage()`
- `getSystemPrompt()`

## Handler and tool helpers

Use these helpers to avoid direct non-null assertions in tests:

```ts
const handler = getHandlerOrThrow(pi, "message_end");
await handler(event, ctx);

const tool = getTool(pi, "web_docs_search");
await tool.execute("tc-1", { library_name: "react" }, undefined, undefined, ctx);
```

## Mocking guidance

When mocking `@mrclrchtr/supi-core`, prefer `importOriginal` so new runtime exports do not break older tests:

```ts
vi.mock("@mrclrchtr/supi-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-core")>();
  return {
    ...actual,
    loadSupiConfig: vi.fn(),
    registerConfigSettings: vi.fn(),
  };
});
```

## Package layout

This package follows the **stay flat utility package** convention from `docs/package-layout.md`:

```text
src/
  api.ts           # Public API surface
  index.ts         # Package-root re-export surface
  pi-mock.ts       # createPiMock(), makeCtx()
  handler-utils.ts # getHandler(), getHandlerOrThrow()
  tool-utils.ts    # getTools(), getTool(), ToolDef
__tests__/
  helpers/         # Shared test utilities
  fixtures/        # Test data
  unit/            # Focused fast tests
  integration/     # Integration tests
```

## Source

- `src/api.ts` — public API surface, re-exports all public functions
- `src/index.ts` — package-root re-export surface, re-exports from `api.ts`
- `src/pi-mock.ts` — `createPiMock()` and `makeCtx()`
- `src/handler-utils.ts` — handler lookup helpers
- `src/tool-utils.ts` — tool lookup helpers
