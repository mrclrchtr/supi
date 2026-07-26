# Centralized code-intelligence prompt steering assumes all tools always active

ADR 0005 divides the `code_*` prompt surface among call mechanics in the
registered schema, selection and safety boundaries in `description`, and
cross-tool steering in `promptGuidelines`. It also notes that
`promptGuidelines` are appended to the `Guidelines` section only while the tool
is active. PI's `docs/pi/tool-guidance.md` restates the same active-only rule:
guidelines are flat, name the tool, and are shown only while the tool is active
(via `pi.setActiveTools`).

In practice, the code-intelligence extension registers the entire `code_*`
surface together at startup, and no production SuPi source calls
`pi.setActiveTools` to narrow the active set. PI's default is
all-registered-tools-active, so in every real session the full `code_*` tool
set — and therefore every `code_*` guideline bullet — is co-visible at once.
There is no automatic repair if a preset, external extension, or future
feature narrows a subset; see Consequences.

This makes two-sided steering (e.g. `code_resolve` saying "use me first for
ambiguous targets" and `code_orientation` saying "use `code_resolve` first, then
pass `targetId` to me") *look* duplicative, because both sides are always
visible. Under the per-tool-active model that duplication is the cost of staying
correct for a narrowed-active future that SuPi does not use. Target references now
use the nested `target.handle` shape; no flat target input is retained.

## Decision

Centralize cross-tool steering for the `code_*` surface: author each steering
rule once, on its natural-home tool (typically the tool it recommends), and
accept **empty `promptGuidelines`** for tools whose selection is fully covered by
their description/schema contract plus a co-visible sibling bullet. Concretely,
`code_inspect` and `code_graph` ship with `promptGuidelines: []`; their selection
is steered by `code_orientation`'s point-facts and relationship bullets, which are
always co-visible.

This also removes duplicated mechanics and safety boundaries from guidelines.
For example, the schema carries the AST `kind` requirement while the description
retains no-silent-fallback behavior. Low-value nudge bullets are dropped per
`docs/pi/tool-guidance.md` ("skip low-value hints").

## Considered Options

- **P1 — keep per-tool dual-sided steering** (stay correct for a narrowed-active
  future): rejected. It pays a permanent token cost for a runtime state SuPi does
  not exercise and duplicates schema mechanics or description safety boundaries
  in guidelines.
- **P2 — centralize on the all-tools-always-active assumption** (chosen): removes
  the real duplication, brings the surface into compliance with ADR 0005 +
  `tool-guidance.md`, and is safe as long as the assumption holds.

## Consequences

- `code_graph` and `code_inspect` have empty `promptGuidelines` **by design**; do
  not "fix" them by re-adding bullets without revisiting this ADR.
- The "all `code_*` tools are always active together" assumption is now
  load-bearing for this prompt surface. **Before shipping any feature that calls
  `pi.setActiveTools` to narrow the `code_*` set**, revisit this ADR: centralized
  steering may vanish for the narrowed set, and dual-sided bullets (per P1) may
  need to return.
- Selection-critical safety cues (`mode:"ast"`, no silent fallback, structural
  callees not being symbol identity, the `code_health` Live health observation
  boundary, and planner/applier mutation separation) remain in `description` and
  are pinned by `extension-registration.test.ts`. Exact selector and mode/kind
  mechanics remain in registered schemas and schema-focused tests. Sibling
  routing may remain in guidelines under this ADR's all-tools-active assumption.
- Truncation limits and conditional full-output spill behavior remain in each
  `description` as required by `docs/pi/tool-guidance.md`.
