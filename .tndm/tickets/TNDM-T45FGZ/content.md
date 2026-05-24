## Problem

`pnpm typecheck` + `pnpm typecheck:tests` run 32 `tsc --noEmit` invocations serially via bash `for` loops, taking ~57s combined.

## Design

Convert source tsconfigs to TypeScript project references, then use `tsc -b` for native parallel, dependency-ordered typechecking with incremental `.tsbuildinfo` caching.

### Dependency graph

```text
supi-core (leaf, 0 supi deps)
├── 12 packages depend on supi-core
└── supi-code-intelligence → supi-core + supi-lsp + supi-tree-sitter

supi-review, supi-test-utils — no supi deps, stay non-composite
```

### Key decisions

1. **Composite packages** (only those referenced by other supi packages):
  - supi-core (referenced by 12 pkgs)
  - supi-lsp (referenced by supi-code-intelligence)
  - supi-tree-sitter (referenced by supi-code-intelligence)
  - Config: `composite: true`, `emitDeclarationOnly: true`, `declarationDir: ./dist`, `rootDir: ./src`, `noEmit: false`

2. **Non-composite source tsconfigs** (10 packages with supi deps but no downstream dependents):
  - Keep `noEmit: true`, add `references` to dependency packages
  - tsc -b still works fine with these

3. **Test tsconfigs**: keep direct `../src/**/*.ts` inclusion (internal symbol access), add `references` only to dependency packages (not own source — avoids dual-inclusion conflicts).

4. **Single command** replaces both serial loops:
   `tsc -b packages/*/tsconfig.json packages/*/__tests__/tsconfig.json`

### Files changed

- `.gitignore` — add `tsbuildinfo` and `dist/` patterns
- `package.json` — update `typecheck` and `verify` scripts, remove `typecheck:tests`
- 3 composite source tsconfigs — supi-core, supi-lsp, supi-tree-sitter
- 10 non-composite source tsconfigs — add references only
- 15 test tsconfigs — add references to dependency packages

### Expected performance

| | Current | After |
|---|---|---|
| Cold | 57s | ~8-12s |
| Incremental | 57s | ~2-4s |
