---
description: Retrospect on SuPi tooling used during the completed task
---

Produce a compact, evidence-based retrospective of the task that just ended. Evaluate the SuPi surfaces that were available and relevant: tools, skills, prompts, extensions, injected context or guidance, documentation, settings, and human-only TUI commands. Do not evaluate the entire suite in the abstract. Do not evaluate pi-core behavior.

## Evidence rules

- Reconstruct the retrospective from this session only. Do not invent tool calls, outcomes, failures, token costs, or user impact.
- You may query the `supi_debug` tool to verify event-level claims. You may query `supi_cache_forensics` when it is available to verify cache-related claims. Use such queries only for verification, and keep them few. Do not perform any other tool calls or follow-up investigation. Stop after you write the retrospective.
- Tag every claim as `[observed]`, `[inferred]`, or `[unknown]`. An observed claim is supported by the transcript, a tool result, or an evidence query. An inferred claim is plausible but untested.
- Rate the impact of each surfaced item as `high`, `medium`, or `low`. The impact is the degree to which the item changed the task outcome or its cost.
- Use the exact surface name that appears in the session. Do not treat an available but unused tool as evidence of failure.
- If no SuPi surface was used or relevant, say so explicitly. Do not build a wishlist. List only task-specific, plausible missed help.

## Evaluate

- SuPi surfaces that were actually used: what they enabled, where they fell short, and any failure or friction.
- Failed or mis-parameterized tool calls: SuPi surface calls that failed or were rejected for wrong, missing, or invalid parameters, including calls corrected on retry. Name the cause: agent misuse, ambiguous tool description, missing guidance (promptSnippet or promptGuidelines), a schema gap, or a tool bug.
- Recognized problems or bugs: concrete defects in SuPi surfaces, such as crashes, wrong output, failed calls for valid usage, regressions, inconsistent behavior, or guidance that led to a wrong action. Do not report defects in the project's own code.
- Missed opportunities: a relevant unused tool (for example a supi-code-intelligence tool) or context source, and why it was missed. Name the cause: discoverability, guidance, timing, capability, or not applicable.
- Missing pieces: a concrete utility, capability, documentation page, example, or output improvement that would have changed this task.
- Noise: redundant instructions, repeated advice without added value, stale or irrelevant context, excessive output, unnecessary long paths, poor timing, or misleading guidance. Do not criticize necessary context without naming the avoidable cost.
- Keep SuPi or tooling recommendations separate from general code or project recommendations.

## Output rules

- Keep the result under about 600 words and specific to this task.
- Open with a one-line overall verdict on SuPi tooling for this task.
- Give each item a confidence tag and an impact rating. `None identified` lines need neither.
- Prefer concrete evidence and observed friction over generic praise or a feature wishlist.
- If a section has no supported item, write `None identified` and briefly explain the evidence limit.
- Include at most three recommendations. Each must name a changeable surface (tool, prompt, skill, docs, guidance, or feature), the proposed change, and the expected benefit. Recommended changes may target tool descriptions, parameter schemas, or guidance, especially when they address the Failed or mis-parameterized tool calls listed above. Do not recommend "use the tool more" unless discoverability is the identified cause.
- Do not edit files, open issues, update OpenSpec artifacts, or take any other follow-up action.

## Required output

## SuPi Tooling Retrospective

**Task completed**: <1–2 sentence summary>

**Verdict**: <one line: the overall state of SuPi tooling for this task and its biggest lever>

### Tools used
- `[observed · impact: high|medium|low]` **`<surface>`** — concrete help, friction, or failure.
- If none: `None identified — no SuPi surface materially participated in this task.`

### Failed or mis-parameterized tool calls
- `[observed|inferred · impact: high|medium|low]` **`<surface>`** — the call, the invalid or missing parameter, the outcome, and the cause: agent misuse, ambiguous description, missing guidance, schema gap, or tool bug. Include near misses: a call rejected once and corrected on retry is stronger evidence than a clean pass.
- If none: `None identified — every SuPi call used valid parameters.`

### Recognized problems or bugs
- `[observed|inferred · impact: high|medium|low]` **`<surface>`** — the concrete defect (crash, wrong behavior, regression, inconsistency) and how it affected the task. Do not repeat ordinary friction that belongs under Tools used, and do not repeat parameter-caused call failures that belong under Failed or mis-parameterized tool calls.
- If none: `None identified — no defect surfaced in this task.`

### Missed opportunities
- `[inferred · impact: high|medium|low]` **`<surface>`** — task-specific help it might have provided. Name the cause: discoverability, guidance, timing, capability, or not applicable.
- If none: `None identified — do not infer a gap from non-use alone.`

### Missing pieces
- `[observed|inferred · impact: high|medium|low]` **`<utility, feature, docs, example, or output change>`** — the concrete gap and how it affected this task.
- If none: `None identified.`

### Unhelpful or noisy context
- `[observed|inferred · impact: high|medium|low]` **`<instruction, context, or output>`** — what was unnecessary or costly, and how it could be reduced or better timed.
- If none: `None identified.`

### Prioritized recommendations
1. **`<named surface>`** — <specific change>; <expected benefit>; confidence: <high|medium|low>.
2. **`<named surface>`** — <specific change>; <expected benefit>; confidence: <high|medium|low>.
3. **`<named surface>`** — <specific change>; <expected benefit>; confidence: <high|medium|low>.
- Include only supported recommendations. If none are supported, write `None identified`.

### Confidence / evidence
- Direct evidence: <what the session and any evidence queries demonstrate>
- Inference: <what is plausible but untested>
- Limits: <what the session cannot establish>