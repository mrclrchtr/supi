# Evidence list module is the sole producer of completeness metadata

**Status:** Accepted (2026-11-14). Refines [root ADR 0004](../../../../docs/adr/0004-evidence-list-truncation-disclosure.md).

Root ADR 0004 required shared completeness metadata, but about ten modules still hand-built `EvidenceListMetadata` literals or recomputed `total − shown` and collected counts. Renderers and orientation facts drifted, and the TUI section cap merged view-hidden rows into evidence omissions. We decided that `src/analysis/evidence.ts` is the only producer of Evidence list metadata:

- Three named constructors cover the cases: a list capped from all collected items, a pre-bounded list with a provider-counted exact total, and a partial list with an unknown total. Metadata is a branded readonly type, so object literals do not type-check; producer-facing inputs such as TUI display sections accept only branded metadata. Two transformers derive from constructed metadata: re-keying keeps counts and state, and marking a list partial after upstream interruption re-derives its state through the same rule.
- Inconsistent counts, such as shown above the total or negative values, throw. They are programmer errors, and clamping them would hide drift.
- Each list publishes its Evidence completeness state (`complete | capped | partial | unbounded`) in structured details. Readers do not infer it from null totals. A list with an exact valid total that excluded invalid provider locations is `partial`, because the provider evidence was not complete.
- Truncation-disclosure wording lives in the module, so markdown, candidate tables, and TUI chrome use the same phrases. The former candidate-only "Search completeness is unknown" sentence is replaced by the canonical partial phrase, which carries the provider message.
- Display omissions (the TUI row cap) are reported separately and never change evidence counts.
- Orientation facts and the `code_orientation` structured details use the same metadata. `collectedCount` is removed from the wire shape.

This is a deliberate wire break for persisted Tool details. A persisted entry without a consistent completeness state is rejected rather than repaired, so sessions saved before the change lose structured TUI chrome on resume and fall back to their markdown content.

The module stays in `analysis/` so session collectors and tool adapters can both depend on it without importing upward.

**Rejected:** centralizing only the derived numbers while keeping hand-built literals, which leaves construction drift possible. Having adapters own the disclosure wording, which gives every surface its own phrasing. Migrating tool by tool with both shapes coexisting, which is a layered migration that the branded type makes unnecessary.
