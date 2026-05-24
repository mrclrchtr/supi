# Task 4: Implement tree-sitter structural substrate adapter

## RED: Write failing test

Create `packages/supi-code-intelligence/__tests__/unit/substrates/tree-sitter-adapter.test.ts`:

- Mock `@mrclrchtr/supi-tree-sitter/api` (`getSessionTreeSitterService`, `createTreeSitterSession`)
- Test: `createStructuralSubstrate(cwd)` returns a `StructuralSubstrate` with all 5 methods
- Test: `exports()` calls through to tree-sitter service, maps `ExportRecord[]` → `ExportData[]` (flattens `range: { startLine, ... }` → flat fields)
- Test: `outline()` maps recursively including children
- Test: `imports()`, `nodeAt()`, `calleesAt()` map correctly
- Test: non-`"success"` result kinds (`"unsupported-language"`, `"file-access-error"`, etc.) pass through unmapped
- Test: falls back to `createTreeSitterSession` when shared service unavailable
- Test: fallback session is disposed after use

Verify tests fail.

## GREEN: Implement

Create `packages/supi-code-intelligence/src/substrates/tree-sitter-adapter.ts`:

```ts
export function createStructuralSubstrate(cwd: string): StructuralSubstrate {
  return {
    calleesAt: (f, l, c) => withSession(cwd, s => s.calleesAt(f, l, c)).then(mapResult(mapCallees)),
    exports: (f) => withSession(cwd, s => s.exports(f)).then(mapResult(mapExports)),
    outline: (f) => withSession(cwd, s => s.outline(f)).then(mapResult(mapOutline)),
    imports: (f) => withSession(cwd, s => s.imports(f)).then(mapResult(mapImports)),
    nodeAt: (f, l, c) => withSession(cwd, s => s.nodeAt(f, l, c)).then(mapResult(mapNodeAt)),
  };
}
```

Helper `withSession(cwd, fn)` — uses shared session if ready, falls back to owned session with dispose.

Helper `mapResult(fn)` — maps `kind: "success"` data through `fn`, passes other variants through.

Mapping helpers: `mapOutline`, `mapExports`, `mapImports`, `mapNodeAt`, `mapCallees` — each unpacks `range: { startLine, startCharacter, endLine, endCharacter }` into flat fields.

Verify tests pass. Run full test suite for no regressions.
