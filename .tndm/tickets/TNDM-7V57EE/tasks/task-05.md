# Task 5: Phase 5: Cleanup — collapse targeting, remove WorkspaceContext, move ArchitectureModel, unify CodeIntelDetails, generate guidance

## Goal

Clean up accumulated cruft across all four packages now that the new architecture is in place. Each sub-goal is independently verifiable but they're batched into one task because they're all pure-deletion or small-inline changes.

## 5a: Collapse targeting pipeline (3 layers → 1)

Current layers:
1. `resolve-target.ts` — orchestrator, route to typed resolvers, format errors/disambiguation
2. `target-resolution.ts` — compat facade ("backward-compat exports")
3. `targeting/` — actual resolvers (query.ts, resolve-anchored.ts, resolve-symbol.ts, resolve-file.ts)

### Files to modify
- `packages/supi-code-intelligence/src/target-resolution.ts` — DELETE (compat facade, nothing imports it except `resolve-target.ts`)
- `packages/supi-code-intelligence/src/resolve-target.ts` — inline the `normalizeQuery` call from `targeting/query.ts`, keep the resolver dispatch, flatten the result handling
- `packages/supi-code-intelligence/src/targeting/` — keep `query.ts`, `resolve-anchored.ts`, `resolve-symbol.ts`, `resolve-file.ts`, `types.ts` but make `resolve-target.ts` their only consumer

After: `resolve-target.ts` directly imports from `targeting/` modules. No intermediate facade.

### Verification
```bash
rg "target-resolution" packages/supi-code-intelligence/src/  # should return zero results
pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json
pnpm vitest run packages/supi-code-intelligence/
```

## 5b: Remove WorkspaceContext

- `packages/supi-code-runtime/src/session/workspace-session.ts` — DELETE file (nothing imports it; verify with `rg "WorkspaceContext|createWorkspaceContext" packages/`)
- `packages/supi-code-runtime/src/api.ts` — remove re-exports of `WorkspaceContext` and `createWorkspaceContext`
- `packages/supi-code-runtime/src/index.ts` — mirror

### Verification
```bash
rg "WorkspaceContext|createWorkspaceContext" packages/  # zero results
pnpm exec tsc -b packages/supi-code-runtime/tsconfig.json
```

## 5c: Move ArchitectureModel into supi-code-intelligence

Currently in `supi-code-runtime/src/project/model.ts`. Only code-intelligence uses it.

### Files to create
- `packages/supi-code-intelligence/src/model.ts` — copy `ArchitectureModel`, `ModuleInfo`, `DependencyEdge`, `buildArchitectureModel`, `findModuleForPath`, `getDependencies`, `getDependents` from `packages/supi-code-runtime/src/project/model.ts`

### Files to modify
- `packages/supi-code-intelligence/src/code-intelligence.ts` — import `buildArchitectureModel` from `./model.ts` instead of `@mrclrchtr/supi-code-runtime/api`
- `packages/supi-code-intelligence/src/use-case/generate-brief.ts` — import `findModuleForPath` from `../model.ts`
- `packages/supi-code-intelligence/src/use-case/build-overview.ts` — update imports
- `packages/supi-code-intelligence/src/brief.ts` — update imports
- `packages/supi-code-intelligence/src/api.ts` — export model types and functions
- `packages/supi-code-runtime/src/api.ts` — keep re-export but from `@mrclrchtr/supi-code-intelligence/api`
- `packages/supi-code-runtime/src/project/model.ts` — keep as re-export shell (or delete after Phase 6)

### Verification
```bash
pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json
pnpm exec tsc -b packages/supi-code-runtime/tsconfig.json
pnpm vitest run packages/supi-code-intelligence/
```

## 5d: Unify tool details types

Current: `BriefDetails`, `MapDetails`, `SearchDetails` — each independent with overlapping fields.

### New shared base
```ts
// packages/supi-code-intelligence/src/types.ts

export interface CodeIntelDetails {
  confidence: ConfidenceMode;
  scope: string | null;
  candidateCount: number;
  omittedCount: number;
  nextQueries: string[];
  /** Tool-specific extension data */
  extras?: Record<string, unknown>;
}
```

### Files to modify
- `packages/supi-code-intelligence/src/types.ts` — add `CodeIntelDetails`, remove `BriefDetails`, `MapDetails`, `SearchDetails`
- All `presentation/markdown/*.ts` files — update return types
- All `use-case/generate-*.ts` files — update details construction
- All `tool/execute-*.ts` files — update return type annotations
- Update test expectations to match new shape

### Verification
```bash
pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json
pnpm vitest run packages/supi-code-intelligence/
```

## 5e: Generate guidance from tool specs

Move `promptGuidelines` generation into `register-tools.ts` so it derives guidance from the tool spec metadata rather than maintaining a separate `guidance.ts` file.

### Files to modify
- `packages/supi-code-intelligence/src/tool/register-tools.ts` — add a `deriveGuidance(specs)` function that generates prompt strings from spec metadata (name, description, params, example usage)
- `packages/supi-code-intelligence/src/tool/guidance.ts` — DELETE content, OR keep a thin wrapper that calls `deriveGuidance`
- Update any test that imports from `guidance.ts`

### Verification
```bash
pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json
pnpm vitest run packages/supi-code-intelligence/__tests__/unit/tool/
```

## Overall Phase 5 verification
```bash
pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-runtime/tsconfig.json
pnpm vitest run packages/supi-code-intelligence/
pnpm exec biome check packages/supi-code-intelligence/src/ packages/supi-code-runtime/src/
```
