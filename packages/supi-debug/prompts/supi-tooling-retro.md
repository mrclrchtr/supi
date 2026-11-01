---
description: Find evidence-grounded tooling improvements from the preceding task
---

Produce a compact retrospective of the task immediately preceding this prompt. Extract reusable improvements to relevant tools, skills, prompts, extensions, injected guidance, docs, settings, and human-only TUI commands. Assess what helped, what got in the way, and what could make the next similar task easier—even when no tool failed. Focus on tooling and workflow fit, not the project's code or a general grade of the agent's performance.

## Scope and evidence

1. Identify the preceding task and its actual completion status from the visible session. If no task is identifiable, state that limit and stop. Keep unrelated tasks and this retrospective's own verification outside the assessment.
2. Use the task transcript as the primary evidence. If verification would materially change a finding or recommendation, make at most two narrowly filtered `debug` calls against the live session, using sanitized data only. Use only events attributable to this task. A retained buffer can omit earlier events; empty or incomplete results do not establish that nothing failed. If verification is unavailable, disclose the limit and proceed.
3. Make no other tool calls or follow-up investigation. Historical scans, delegation, file edits, issue creation, settings changes, and continuing the task are outside this retrospective. Stop after the report.

For each finding, give a brief evidence anchor: a tool result or error, a retry, a user correction, or a specific instruction/context excerpt. Use exact surface names from the session. Keep excerpts minimal and omit secrets or unnecessary identifying details.

Use these evidence labels:
- `[observed]`: directly supported by the visible transcript or verification result.
- `[inferred]`: a plausible interpretation or missed benefit, not demonstrated.
- `[unknown]`: an unresolved cause, ownership, or measurement; not a standalone finding.

Separate observed outcomes from suspected causes. Distinguish SuPi-owned surfaces, upstream Pi/provider behavior, project-local guidance, and agent behavior; mark unresolved ownership or cause `[unknown]`. Keep upstream behavior and project-code defects out of SuPi bug claims. Judge fault separately from improvement potential: agent error can still expose a useful interface or workflow change.

Rate each finding's impact on this task as `high`, `medium`, or `low`, based on the demonstrated effect or explicitly inferred benefit. Report time, token, cache, or cost figures only when measured in the task evidence; describe unmeasured costs qualitatively. Claims about recurring problems or suite-wide reliability require evidence beyond this retrospective's scope.

## Assessment checklist

Consider each category, but report each finding once:
- **Help:** What a used surface enabled, including useful guidance or context—not just a list of calls.
- **Failures, retries, and defects:** Include rejected or mis-parameterized calls even when corrected on retry. Name the parameter or error, task effect, and eventual outcome. Distinguish misuse, guidance/schema gaps, and suspected tool defects; keep uncertain causes explicit.
- **Guidance and workflow fit:** Assess visible descriptions, parameter explanations, `promptSnippet`, `promptGuidelines`, result guidance, and skill instructions at the decision point. Look for ambiguity, poorly timed guidance, and workflow assumptions that did not fit this task. Distinguish missing or unhelpful guidance from clear guidance the agent did not follow.
- **Missed opportunities and missing pieces:** Look for workarounds, repetitive manual steps, missing capabilities, and output improvements that could have helped. For an unused surface, establish its availability and relevance; non-use alone is not a gap. Ground ideas in a specific task moment, not a suite-wide wishlist.
- **Context efficiency:** Identify oversized, redundant, stale, or poorly timed context. Distinguish recurring metadata/injections from results and on-demand reads; mark uncertain placement `[unknown]`. For deletion proposals, quote the overlap and name retained guidance that preserves tool selection, valid arguments, and safety. Account for mandatory reading: a required read is not agent waste, but its routing or packaging may be an improvement candidate.

For consequential friction, consider a concrete tooling or guidance change as well as an agent lesson. A proposal needs an evidence anchor and a plausible mechanism; root-cause proof or demonstrated recurrence is not required to suggest an experiment. Repeating an existing instruction belongs under agent lessons; an interface, timing, or workflow change needs its own rationale.

## Report

Use the structure below, within 600 words; shorter when evidence is sparse. Prioritize consequential findings rather than filling categories or a recommendation quota. Use evidence labels to express uncertainty; add prose caveats only when they change the proposed action. Omit empty sections. If no SuPi surface was used or relevant, say so explicitly and omit unsupported findings and recommendations.

## SuPi Tooling Retrospective

**Task**: <one sentence, including actual completion status>

**Verdict**: <overall contribution and highest-leverage tooling opportunity, or no tooling change warranted>

### What helped
- `[observed · impact: high|medium|low]` **`<surface>`** — <concrete contribution; evidence anchor>.

### Failures and friction
- `[observed|inferred · impact: high|medium|low]` **`<surface>`** — <finding; evidence anchor; task effect>. <Cause or ownership, separately labeled if inferred or unknown. Include retry outcomes where visible.>

### Tooling improvements
Include at most three prioritized proposals tied to reported findings: **owner / named surface → specific change → expected benefit → validation**. Name the editable surface and changed behavior; use a file path only if known. Mark untested changes and benefits `[inferred]`. Prefer the smallest experiment that addresses the friction; when evidence is insufficient to choose a change, name the narrow verification that would decide it. Preserve selection, argument validity, and safety in context-reduction proposals. If none emerge, state `No tooling change warranted by the available evidence.`

### Agent lessons
<At most two task-specific execution lessons, separate from tooling improvements. Omit when there are none.>

### Evidence limits
<State only limits that materially affect the findings or proposals; omit inventories of unassessed internals. Distinguish incomplete evidence from an uneventful observed task.>
