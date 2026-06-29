# Task 1: Define anchored target resolution result metadata and target details

**Description:**

Establish the public/internal result shapes needed for real anchored target resolution and downstream `code_context` metadata. The goal is to make exact, snapped, degraded, and unavailable coordinate resolution states explicit without relying on markdown parsing.

This task should define the vocabulary and types before changing behavior:

- A resolved target metadata shape suitable for `details.data.target`.
- Resolution metadata that records requested coordinates, resolved coordinates, whether snapping happened, and the evidence source.
- Candidate metadata for ambiguous coordinate resolution, including `targetId` for every candidate.
- A rendering strategy where markdown notes appear only for non-obvious cases, while structured details always include resolution metadata.

Keep this compatible with ADR 0003 (`Name anchor` vs `Declaration anchor`) and ADR 0004 (tool evidence and completeness metadata). Do not introduce a new point-context mode for `code_context`.

**Files:**

- `packages/supi-code-intelligence/src/types.ts` — add/extend structured details types for context/resolve target metadata.
- `packages/supi-code-intelligence/src/analysis/resolve/service.ts` — expose resolution metadata from the resolve service result shape.
- `packages/supi-code-intelligence/src/presentation/markdown/resolve.ts` — prepare renderer support for snapped/degraded notes.
- `packages/supi-code-intelligence/src/workflow/target-store.ts` — use existing target metadata; avoid adding persistence beyond current session scope unless required.

**Acceptance criteria:**

- Structured details can represent:
  - exact anchored hit
  - snapped anchored hit
  - unavailable anchored coordinate
  - ambiguous candidates with targetIds
- Markdown rendering can show a note only when a coordinate was snapped or degraded.
- Normal exact name-anchor hits do not get noisy markdown provenance.
- Types compile without changing current runtime behavior until later tasks wire them in.
- Target metadata includes at least `targetId`, `spanId`, `file`, `line`, `character`, `name`, `kind`, `anchorKind`, `confidence`, and resolution metadata.
