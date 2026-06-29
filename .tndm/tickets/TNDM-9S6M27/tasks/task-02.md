# Task 2: GREEN: Implement workflow target store and resolve service

# Goal

Add the internal implementation that turns current target-resolution outputs into session-scoped target handles.

# Files

Create:

- `packages/supi-code-intelligence/src/workflow/target-store.ts`
- `packages/supi-code-intelligence/src/analysis/resolve/service.ts`

Modify:

- `packages/supi-code-intelligence/src/workflow/index.ts`
- `packages/supi-code-intelligence/src/workflow/surface.ts`
- `packages/supi-code-intelligence/src/types.ts`

# Implementation notes

## `src/workflow/target-store.ts`

Implement a small cwd-scoped store with exported types/helpers such as:

- `WorkflowResolvedTargetEntry`
- `WorkflowTargetLookupResult`
- `registerWorkflowTarget(cwd, target)`
- `getWorkflowTarget(cwd, targetId)`
- `clearWorkflowTargets(cwd)`
- `clearAllWorkflowTargets()` if useful for tests

Store entry fields should include:

- `targetId`
- `spanId`
- absolute `file`
- 0-based `position`
- 1-based `displayLine` / `displayCharacter`
- `name`
- `kind`
- `confidence`
- `provenance`
- file fingerprint

Use deterministic opaque IDs derived from normalized cwd, file, range/position, symbol metadata, and file fingerprint. Re-resolving the same target with unchanged file contents should reuse the same IDs.

Use SHA-256 file fingerprints for stale detection. If a file cannot be read during registration, still report an explicit error rather than storing an uncheckable target.

## `src/analysis/resolve/service.ts`

Implement the typed `code_resolve` service. It should:

- validate cross-field runtime rules
- get the composite code provider through `getCodeProviderState(cwd)`
- resolve anchored inputs through existing anchored resolution
- resolve file-only inputs through existing file target group resolution with semantic/structural providers when available
- resolve query inputs through semantic workspace symbols, using `scope` and `kind` filters
- optionally treat `kind: "file"` plus a path-like `query` as a bounded direct file resolution before semantic symbol lookup
- register all resolved targets/candidates in the target store
- return a typed result that includes target entries, omitted count, confidence/provenance, and an error/disambiguation state when relevant

Do not add broad text-search fallback for unresolved query/symbol resolution.

## `src/types.ts`

Add `ResolveDetails` and include `{ type: "resolve"; data: ResolveDetails }` in `CodeIntelResult`.

Minimum `ResolveDetails` fields:

- `confidence`
- `targetCount`
- `omittedCount`
- `targets`
- `nextQueries`

# Verification

Run the target-store tests first, then the resolve tests:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/workflow-target-store.test.ts -v
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts -v
```

Expected result after this task: target-store tests should pass. Some `code_resolve` tests may still fail until the public tool executor and registration are implemented in the next task; failures should be limited to registration/executor wiring, not target-store or resolve-service logic.
