# Task 3: Add explicit absent-substrate-tool assertions to registration test

## Goal

In `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`, add a test that explicitly asserts specific `lsp_*` and `tree_sitter_*` tool names are absent from the active public tool surface.

Add a new test under "focused code intelligence tool registration" describe block:

```ts
it("does not register any lsp_* or tree_sitter_* substrate tools", () => {
  const pi = createPiMock();
  codeIntelligenceExtension(pi as never);

  const names = getTools(pi).map((t: { name: string }) => t.name);
  const substratePrefixes = ["lsp_", "tree_sitter_"];
  const substrateTools = names.filter((n) =>
    substratePrefixes.some((prefix) => n.startsWith(prefix))
  );
  expect(substrateTools).toEqual([]);
});
```

## Verification

- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` — new test passes
- Intentionally register an `lsp_` tool and confirm the test would catch it — not required for commit, just sanity
