# code_* prompt surface: mechanics in description, steering in guidelines

For the `code_*` tools in `supi-code-intelligence`, the full tool mechanics
(mode/kind matrix, anchored-resolution snapping, `targetId`-precedence, side
effects, truncation limits, ordering) live in `description` — the always-on
provider tool description. `promptGuidelines` shrink to ≤5 bullets that each
name the tool and carry only sibling-selection steering ("use code_graph
instead of code_impact when …") plus the one or two execution rules that most
prevent misuse at call time. No mechanics are re-listed in guidelines.

`promptGuidelines` are appended to the `Guidelines` section **only while the
tool is active**, so any mechanic that lived solely in guidelines would be
invisible at tool-selection time. Keeping the contract self-sufficient in
`description` guarantees correct selection; trimming guidelines to
high-leverage steering removes the description↔guidelines duplication that was
the real token waste. This tensions pure token-efficiency (descriptions stay
longer than a minimal skeleton) but follows the tool-guidance rule: keep
negative/ordering guidance only when it materially improves tool choice or
execution quality.

## Considered Options

- **Guidelines summarize mechanics too** — rejected: duplicates the
  description and the checklist flags this as token waste.
- **Mechanics in guidelines, description high-level** — rejected: mechanics
  vanish when the tool is inactive, weakening selection; description becomes
  too thin to self-describe.

## Consequences

- Descriptions are deliberately longer than a "minimal skeleton" rewrite; do
  not "trim" them by moving mechanics into guidelines.
- When adding a new `code_*` tool, put the full contract in `description` and
  keep `promptGuidelines` to selection + key execution rules.
- Tests in `extension-registration.test.ts` pin specific substrings
  (`requires \`kind\``, the six AST kinds, `does not silently fall back`,
  `not by symbol identity`, `symbol-identity-aware callers`, `code_health`
  coverage/unused); tightening must preserve that set.
