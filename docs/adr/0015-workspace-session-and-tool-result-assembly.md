# Workspace session and canonical Tool result assembly

**Status:** Accepted (2026-07-13)

## Context

Code-intelligence executors repeated target resolution, readiness checks, provider selection, plan storage, cancellation, progress, and result-policy decisions. That repetition made each tool shallow and allowed markdown, structured details, and TUI output to disagree. It also let mutable provider and target state leak through seams that should carry stable facts.

## Decision

Use `WorkspaceCodeIntelligenceSession` as the internal workflow interface for one workspace and PI session.

The session owns:

- target resolution and opaque target handles
- semantic readiness and provider-selection policy
- graph, find, inspect, Orientation, health, and refactor workflow coordination
- fingerprinted refactor plans
- overview and instruction-file deduplication state
- per-call cancellation and progress translation

Session workflows return typed, immutable outcomes. Providers, clients, mutable target records, and the LSP manager do not cross this seam. Invalid input, disambiguation, unavailable capability, timeout, partial evidence, and completed work remain distinct outcomes.

`src/tool/result/assembly.ts` is the canonical Tool result assembly module. It owns sections, evidence lists, totals, omission metadata, confidence, provenance, actions, and read-next guidance. Intent-specific result modules project assembled facts into existing structured details. Markdown and TUI modules are adapters over assembled results; they do not collect evidence or recompute completeness.

Orientation context collection produces typed `OrientationBlock` facts directly. It no longer renders a brief and reparses markdown at the session seam.

Tool executors stay thin: translate PI execution controls, invoke one session workflow, assemble its outcome, and hand the assembly to presentation adapters.

## Consequences

- Workflow policy gains locality in one deep module instead of being copied across eight tools.
- Result-policy changes have high leverage because one assembly interface controls both presentation adapters.
- The session remains internal to `supi-code-intelligence`; `supi-code-runtime` remains the capability broker and canonical-type module.
- The session does not own LSP lifecycle. It receives the runtime attached by application wiring.
- Adding a workflow requires a typed session outcome and an assembly projection before presentation work.
- Tests prefer session and public-tool behavior over private forwarding or map-registration assertions.

## Rejected alternatives

- **Return final rendered Tool results from the session:** mixes workflow policy with presentation and reduces module depth.
- **Expose providers or mutable targets from the session:** weakens the seam and lets policy escape into executors.
- **Keep per-tool result builders:** preserves duplication and allows omission metadata to drift.
- **Add a compatibility layer over the old executors:** creates two workflow interfaces and defeats the replace-not-layer migration.
