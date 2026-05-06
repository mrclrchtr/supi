# supi-test-utils

Shared test utilities for SuPi extension tests. Not a pi extension — imported directly in test files.

## Exports

- `createPiMock()` — returns a configurable mock `ExtensionAPI` with `Map`-captured handlers, commands, tools, and renderers
- `makeCtx(overrides?)` — returns a minimal handler context mock (`ctx`) with stubbed `ui`, `sessionManager`, and `cwd`

## Usage

```ts
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { vi } from "vitest";

const pi = createPiMock();
myExtension(pi);

// Assert handlers were registered
expect(pi.handlers.get("session_start")).toHaveLength(1);

// Call a handler
const handler = pi.handlers.get("tool_call")?.[0];
await handler?.(mockEvent, makeCtx({ cwd: "/test" }));
```

## Gotchas

- `vi.mock` hoisting errors propagate from the importing module, not the test's `vi.mock` call site — check the Caused-by chain.
- In Vitest 4.x, constructor mocks inside `vi.mock` factories must use `class` — `vi.fn().mockImplementation(() => ({}))` silently returns `this`.
- When the code under test uses `pi.events`, include `events: { emit: vi.fn(), on: vi.fn() }` in the mock.
