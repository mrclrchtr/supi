# code_* prompt surface: schemas own mechanics, descriptions own selection boundaries

For every active `code_*` tool, the model receives both its provider description and its registered parameter schema. These surfaces form one callable contract rather than duplicating the same detail.

## Decision

Registered parameter schemas own call mechanics they can express exactly:

- required and optional fields
- exact-one nested selectors and operation payloads
- mode, kind, relation, and other enum vocabularies
- cardinality, uniqueness, range, and closed-object constraints

Descriptions remain selection-sufficient and retain prose that schemas cannot communicate:

- purpose and when to choose the tool
- capability and readiness requirements
- cross-tool routing and no-silent-fallback rules
- semantic versus structural evidence boundaries
- mutation sequencing and side effects
- incomplete-evidence and output-truncation disclosure

A description may summarize inputs when that helps selection, but it need not repeat exact nested syntax, complete enum lists, or operation payload shapes already present in the schema. Result-time disclosures own call-specific omissions and provenance; descriptions retain the promise that partial evidence is disclosed.

`promptGuidelines` stay at five or fewer bullets per tool. They carry concise sibling-selection steering and only high-value execution guidance. They do not replace schema mechanics or selection-critical description boundaries because guidelines are appended only while a tool is active.

The public family is:

- `code_resolve`
- `code_inspect`
- `code_orientation`
- `code_graph`
- `code_find`
- `code_health`
- `code_refactor_plan`
- `code_refactor_apply`

This division is Prompt Surface Compression, not a callable-contract reduction. Repeating machine-readable schema detail in prose adds permanent prompt cost and creates another surface that can drift, while moving readiness, fallback, mutation, or evidence boundaries out of descriptions would weaken tool selection.

## Considered Options

- **Repeat complete mechanics in descriptions and schemas** — rejected because it duplicates always-visible metadata and invites drift.
- **Put mechanics or safety boundaries in guidelines** — rejected because guidelines are active-only and are not a substitute for provider tool metadata.
- **Use purpose-only descriptions** — rejected because schemas cannot express routing, readiness, fallback, mutation, or evidence interpretation.

## Consequences

- Do not re-expand descriptions solely to restate exact schema syntax or enum values.
- Registration tests pin final composed descriptions and high-risk selection cues; schema tests pin exact selectors, mode/kind matrices, and validation constraints.
- `src/tool/specs.ts`, `src/tool/guidance.ts`, and the schema map remain aligned with the exact eight-tool list.
- Adding or removing a tool updates schemas, descriptions, guidelines, registration, and active-tool tests in the same change.
