# Code-intelligence prompt steering with session tool controls

ADR 0005 assigns tool selection rules to `description`, parameter mechanics to
schemas, and cross-tool routes to `promptGuidelines`. PI adds a tool's
`promptGuidelines` only while that tool is active.

`/supi-capabilities` can turn eligible extension tools off for one session. PI's
startup tool allowlist remains the limit. A `code_*` tool can be active while a
sibling tool is inactive. A guideline must not direct the model to call an
inactive tool.

## Decision

Keep each cross-tool route on one natural owner. Name a sibling tool only when
the guideline says to use it **when available**. The `code_find` guideline
routes broad discovery to `code_resolve` and `code_graph` when each tool is
available. The `code_inspect` guideline routes wider diagnostics to
`code_health` when it is available.

Keep selection and safety rules in tool descriptions and schemas. Do not repeat
those rules in guidelines. Keep empty `promptGuidelines` on tools whose
description and schema define their selection contract.

## Considered options

- **P1 — repeat each route on both tools:** rejected. It duplicates prompt text.
- **P2 — assume all code tools stay active together:** rejected. The session
  selector supports a smaller active set.
- **P3 — keep one route and mark sibling tools as conditional:** chosen. It
  keeps guidance short and does not point to a missing tool.

## Consequences

- The active `code_*` tool set can differ by session.
- Cross-tool guidance must use availability conditions.
- Tests must check those conditions and must not assume that every registered
tool is active.
- Selection-critical rules stay in descriptions and schemas. Standard PI
  result limits stay in result builders, not in tool descriptions.
