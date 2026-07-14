# code_* prompt surface: mechanics in description, steering in guidelines

For the eight `code_*` tools in `supi-code-intelligence`, complete call mechanics live in `description`, the always-visible provider tool description. This includes exact-one nested selectors, mode/kind matrices, result limits, side effects, and evidence semantics.

`promptGuidelines` stay at five or fewer bullets per tool. They carry sibling-selection steering and only the execution rules that most prevent misuse. Mechanics are not repeated there.

The public family is:

- `code_resolve`
- `code_inspect`
- `code_orientation`
- `code_graph`
- `code_find`
- `code_health`
- `code_refactor_plan`
- `code_refactor_apply`

`promptGuidelines` are appended to the Guidelines section only while a tool is active. A mechanic that exists solely in guidelines would therefore be invisible during tool selection. Keeping each `description` self-sufficient preserves selection correctness; concise guidelines reduce prompt duplication.

## Considered Options

- **Guidelines summarize mechanics too** — rejected because it duplicates descriptions and wastes prompt tokens.
- **Mechanics in guidelines, description high-level** — rejected because mechanics vanish when the tool is inactive.
- **Keep guidance for retired tools or flat inputs** — rejected because stale steering is worse than omitted steering.

## Consequences

- Descriptions are deliberately longer than a minimal skeleton; do not shorten them by moving mechanics into guidelines.
- `src/tool/specs.ts` and `src/tool/guidance.ts` must remain aligned with the exact eight-tool list.
- Prompt tests pin high-risk cues: AST mode requirements, no silent fallback, structural callees versus symbol identity, exact-one target shapes, and planner/applier separation.
- Adding or removing a tool updates schemas, descriptions, guidelines, registration, and active-tool tests in the same change.
