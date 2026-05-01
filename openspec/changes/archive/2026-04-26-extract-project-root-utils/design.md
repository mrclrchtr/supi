## Context

`supi-lsp` currently owns several filesystem helpers that are not inherently LSP-specific:

- project walking and marker-based root detection in `scanner.ts` / `utils.ts`
- root deduplication and path-depth helpers in `scanner.ts`
- known-root merge and resolution helpers in `manager-roots.ts`

The planned `supi-code-intelligence` package needs project/module discovery for architecture briefs. Those needs overlap with the current LSP scanning helpers, but `supi-code-intelligence` should not import `@mrclrchtr/supi-lsp/scanner.ts` or reimplement the same algorithms.

## Goals / Non-Goals

**Goals:**
- Move LSP-agnostic project/root utilities into `supi-core`
- Keep utility behavior identical for existing `supi-lsp` callers
- Export the utilities as a stable shared surface for peer extensions
- Keep the refactor small and independently reviewable

**Non-Goals:**
- Changing the root detection algorithm or marker semantics
- Adding broad language/module detection for `supi-code-intelligence`
- Building a codebase map or architecture model in this change
- Changing any `lsp` tool behavior or prompt guidance

## Decisions

### 1. Put shared utilities in `supi-core`

**Decision:** Add a `packages/supi-core/project-roots.ts` module and export it from `packages/supi-core/index.ts`.

**Rationale:** These helpers are pure filesystem/path utilities already needed by multiple extensions. `supi-core` is the existing shared infrastructure package, so it is the least surprising home.

**Alternatives considered:**
- Keep helpers in `supi-lsp` and import them from peer extensions — couples peers to implementation files and creates an inverted dependency on LSP internals
- Duplicate helpers in `supi-code-intelligence` — creates drift risk
- Create a new utility package — unnecessary package surface for a small set of helpers

### 2. Preserve behavior exactly

**Decision:** This change is a pure extraction. The moved functions SHALL retain their current signatures and semantics where they are already exported or externally consumed within the workspace.

**Rationale:** `supi-lsp` already has tests and operational assumptions around root scanning. This change should unlock reuse without changing behavior.

**Implementation notes:**
- Move exported helpers directly where possible
- Export currently-private helpers only when they are useful as shared building blocks
- Keep existing ignored directories, depth behavior, path normalization, root specificity ordering, and fallback handling unchanged

### 3. Keep architecture scanning out of this change

**Decision:** `extract-project-root-utils` provides primitives only. `supi-code-intelligence` will decide how to interpret modules, package metadata, dependency edges, and brief formatting.

**Rationale:** Separating pure utility extraction from product behavior keeps both changes easier to review and reduces the risk of accidental product-scope creep.

## Risks / Trade-offs

- **[Accidental behavior drift]** Moving helpers can subtly change imports, relative paths, or default behavior. **Mitigation:** move or add focused unit tests and run existing `supi-lsp` tests.
- **[Over-exporting internals]** Exporting too many helpers can freeze unnecessary API. **Mitigation:** export only utilities with clear cross-extension value and document them as project/root helpers.
- **[Circular dependencies]** `supi-core` must remain below `supi-lsp`. **Mitigation:** keep the new module free of imports from `supi-lsp` or other higher-level packages.

## Migration Plan

- Add `packages/supi-core/project-roots.ts` containing the shared helpers
- Export helpers from `packages/supi-core/index.ts`
- Update `supi-lsp/scanner.ts`, `supi-lsp/utils.ts`, and `supi-lsp/manager-roots.ts` to import from `supi-core`
- Remove local duplicate implementations from `supi-lsp`
- Move or add tests for the shared helpers and run existing `supi-lsp` verification
