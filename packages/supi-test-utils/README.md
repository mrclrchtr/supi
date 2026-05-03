# @mrclrchtr/supi-test-utils

Shared test utilities for SuPi extension packages.

## `createPiMock()`

Returns a mock `ExtensionAPI` that captures everything an extension registers:

```ts
import { createPiMock } from "@mrclrchtr/supi-test-utils";

const pi = createPiMock();
myExtension(pi as unknown as ExtensionAPI);

expect(pi.handlers.has("session_start")).toBe(true);
expect(pi.tools.length).toBe(1);
```

## `makeCtx(overrides?)`

Returns a minimal mock context for handler tests:

```ts
import { makeCtx } from "@mrclrchtr/supi-test-utils";

const ctx = makeCtx({ cwd: "/other" });
await handler("args", ctx);
```

## Future-proof `vi.mock` for `@mrclrchtr/supi-core`

When mocking `@mrclrchtr/supi-core`, use `importOriginal` so new exports do
not break existing tests:

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

This spreads the real module first, then overwrites only the functions you
need to mock. When `supi-core` adds a new export, tests continue to work.
