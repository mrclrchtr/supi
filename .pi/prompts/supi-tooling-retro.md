---
description: Retrospect on SuPi tooling used during the completed task
---

Produce a compact, evidence-based retrospective of the task that just ended. Evaluate SuPi-provided tools, skills, prompts, extensions, and injected context—not the entire suite in the abstract.

## Evidence rules

- Reconstruct the retrospective from this session only. Do not invent tool calls, outcomes, failures, token costs, or user impact.
- Tag claims as `[observed]`, `[inferred]`, or `[unknown]`. An observed claim is supported by the transcript or a tool result; an inferred claim is plausible but untested.
- Use the exact surface name shown in the session. Do not treat a tool being available but unused as evidence that it failed.
- If no SuPi surface was used or relevant, say so explicitly. Do not manufacture a wishlist; list only task-specific, plausible missed help.
- Do not make tool calls or perform follow-up investigation. Stop after writing the retrospective.

## Evaluate

- Actual SuPi surfaces used: what they enabled, where they fell short, and any failure or friction.
- Missed opportunities: a relevant unused tool (like supi-code-intelligence tools) or context source, and why it was missed—discoverability, guidance, timing, capability, or not applicable.
- Missing pieces: a concrete utility, capability, documentation page, example, or output improvement that would have changed this task.
- Noise: redundant instructions, repeated advice without added value, stale or irrelevant context, excessive output, unnecessary long paths, poor timing, or misleading guidance. Do not criticize necessary context without naming the avoidable cost.
- Keep SuPi/tooling recommendations separate from general code or project recommendations.

## Output rules

- Keep the result under about 500 words and specific to this task.
- Prefer concrete evidence and observed friction over generic praise or a general feature wishlist.
- If a section has no supported item, write `None identified` and explain the evidence limit briefly.
- Include at most three recommendations. Each must name a changeable surface (tool, prompt, skill, docs, guidance, or feature), the proposed change, and the expected benefit. Do not recommend “use the tool more” unless discoverability is the identified cause.
- Do not edit files, open issues, update OpenSpec artifacts, or take any other follow-up action.

## Required output

## SuPi Tooling Retrospective

**Task completed**: <1–2 sentence summary>

### Tools used
- `[observed]` **`<tool, skill, prompt, extension, or context>`** — concrete help, friction, or failure.
- If none: `None identified — no SuPi surface materially participated in this task.`

### Missed opportunities
- `[inferred]` **`<surface>`** — task-specific help it might have provided; cause: discoverability, guidance, timing, capability, or not applicable.
- If none: `None identified — do not infer a gap from non-use alone.`

### Missing pieces
- `[observed|inferred]` **`<utility, feature, docs, example, or output change>`** — the concrete gap and how it affected this task.
- If none: `None identified.`

### Unhelpful or noisy context
- `[observed]` **`<instruction, context, or output>`** — what was unnecessary or costly and how it could be reduced or better timed.
- If none: `None identified.`

### Prioritized recommendations
1. **`<named surface>`** — <specific change>; <expected benefit>; confidence: <high|medium|low>.
2. **`<named surface>`** — <specific change>; <expected benefit>; confidence: <high|medium|low>.
3. **`<named surface>`** — <specific change>; <expected benefit>; confidence: <high|medium|low>.
- Include only supported recommendations; if none are supported, write `None identified`.

### Confidence / evidence
- Direct evidence: <what the session demonstrates>
- Inference: <what is plausible but untested>
- Limits: <what the session cannot establish>
