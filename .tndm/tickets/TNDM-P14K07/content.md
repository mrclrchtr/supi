## Brainstorming Outcome
**Problem**: Review a proposed `packages/supi-lsp` source/test reorganization before implementation.
**Recommended approach**: Proceed with a narrower restructure than proposed. Keep `lsp.ts` and public surfaces at the root, add `ui/`, `tool/`, and a smaller `guidance/` folder, but avoid a catch-all `core/` bucket and avoid moving manager-facing summary/diagnostic aggregation code into `guidance/`.
**Why**: The current proposal improves discoverability, but it mixes domain layers. `summary.ts` and `diagnostic-summary.ts` are used by `manager.ts`, and `diagnostic-augmentation.ts` is used by `overrides.ts`; moving them under `guidance/` would create misleading dependencies from runtime/manager code into prompt/presentation code. A broad `core/` folder would also become a miscellaneous bucket.
**Constraints / non-goals**: Preserve the package API boundary (`api.ts` / `index.ts` re-exports), keep `lsp.ts` as the main wiring file, avoid unrelated refactors, and update test/docs/tooling paths if tests move into nested folders.
**Open questions**: Whether to introduce a purpose-named folder for protocol/config primitives (instead of `core/`) and whether `workspace-sentinels.ts` belongs with session wiring or workspace-recovery logic.
**Ticket**: TNDM-P14K07
