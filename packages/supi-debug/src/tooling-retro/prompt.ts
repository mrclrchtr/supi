/**
 * Increment whenever TOOLING_RETRO_PROMPT changes so evidence collectors can
 * separate assessments answering different questions.
 */
export const TOOLING_RETRO_PROMPT_REVISION = 2;

/** Command description shown in slash-command completion. */
export const TOOLING_RETRO_DESCRIPTION =
  "Find evidence-grounded tooling improvements from the preceding task";

/** User message sent by `/supi-tooling-retro`; formerly the prompt template of that name. */
export const TOOLING_RETRO_PROMPT = `Produce a compact retrospective of the task immediately preceding this prompt. Extract reusable improvements to relevant tools, skills, prompts, extensions, injected guidance, docs, settings, and human-only TUI commands. Assess what helped, what got in the way, and what could make the next similar task easier—even when no tool failed. Focus on tooling and workflow fit, not the project's code or a general grade of the agent's performance.

## Scope and evidence

1. Identify the preceding task and its actual completion status from the visible session. If no task is identifiable, state that limit and stop. Keep unrelated tasks and this retrospective's own verification outside the assessment.
2. Use the task transcript as the primary evidence. If verification would materially change a finding or recommendation, make at most two narrowly filtered \`debug\` calls against the live session, using sanitized data only. Use only events attributable to this task. A retained buffer can omit earlier events; empty or incomplete results do not establish that nothing failed. If verification is unavailable, disclose the limit and proceed.
3. Make no other tool calls or follow-up investigation. Historical scans, delegation, file edits, issue creation, settings changes, and continuing the task are outside this retrospective. Stop after the report.

For each finding, give a brief evidence anchor: the smallest distinguishing input and observed result (for example, query/scope and completeness reason), a retry, a user correction, or a specific instruction/context excerpt. Use exact surface names from the session. Treat tool-reported limits as observations; mark their underlying cause \`[unknown]\` where unresolved. Keep excerpts minimal and omit secrets or unnecessary identifying details.

Use these evidence labels:
- \`[observed]\`: directly supported by the visible transcript or verification result.
- \`[inferred]\`: a plausible interpretation or missed benefit, not demonstrated.
- \`[unknown]\`: an unresolved cause, ownership, or measurement; not a standalone finding.

Separate observed outcomes from suspected causes. Distinguish SuPi-owned surfaces, upstream Pi/provider behavior, project-local guidance, and agent behavior; mark unresolved ownership or cause \`[unknown]\`. Keep upstream behavior and project-code defects out of SuPi bug claims. Judge fault separately from improvement potential: agent error can still expose a useful interface or workflow change.

Rate each finding's impact on this task as \`high\`, \`medium\`, or \`low\`, based on the demonstrated effect or explicitly inferred benefit. Report time, token, cache, or cost figures only when measured in the task evidence; describe unmeasured costs qualitatively. Claims about recurring problems or suite-wide reliability require evidence beyond this retrospective's scope.

## Assessment checklist

Report a category only when its trigger occurred in this task, and report each finding once:
- **Help:** _Use when_ a surface changed the task's outcome or effort. What a used surface enabled, including useful guidance or context—not just a list of calls.
- **Failures, retries, and defects:** _Use when_ a call was rejected, failed, or repeated. Include rejected or mis-parameterized calls even when corrected on retry. Name the parameter or error, task effect, and eventual outcome. Distinguish misuse, guidance/schema gaps, and suspected tool defects; keep uncertain causes explicit.
- **Guidance and workflow fit:** _Use when_ the agent chose a surface, an argument, or a next step and visible guidance shaped or failed to shape that choice. Assess visible descriptions, parameter explanations, \`promptSnippet\`, \`promptGuidelines\`, result guidance, and skill instructions at the decision point. Look for ambiguity, poorly timed guidance, and workflow assumptions that did not fit this task. Distinguish missing or unhelpful guidance from clear guidance the agent did not follow.
- **No-ops:** _Use when_ a visible instruction applied to a task moment and the behavior there matched what would be expected without it. Quote the instruction and the moment. An instruction the task never exercised is not a no-op; mark an unclear effect \`[unknown]\`.
- **Navigation:** _Use when_ finding a file, symbol, or piece of information took several searches or reads. Name the starting point, the detours, and where the answer was. Consider whether a pointer in the surface the agent consulted first, or a hidden dependency made explicit, would have shortened the path.
- **Information access:** _Use when_ a fact the task depended on was unreachable or reachable only by a workaround, such as logs, runtime state, an external service, or a tool's own internals. Name the fact and how the agent proceeded without it.
- **Missed opportunities and missing pieces:** _Use when_ the agent worked around a gap or repeated a manual step. Look for workarounds, repetitive manual steps, missing capabilities, and output improvements that could have helped. For an unused surface, establish its availability and relevance; non-use alone is not a gap. Ground ideas in a specific task moment, not a suite-wide wishlist.
- **Context efficiency:** _Use when_ a result, injection, or required read was large relative to what the task used from it. Identify oversized, redundant, stale, or poorly timed context. Distinguish recurring metadata/injections from results and on-demand reads; mark uncertain placement \`[unknown]\`. For deletion proposals, quote the overlap and name retained guidance that preserves tool selection, valid arguments, and safety. Account for mandatory reading: a required read is not agent waste, but its routing or packaging may be an improvement candidate.

For consequential friction, consider a concrete tooling or guidance change as well as an agent lesson. A proposal needs an evidence anchor and a plausible mechanism; root-cause proof or demonstrated recurrence is not required to suggest an experiment. Repeating an existing instruction belongs under agent lessons; an interface, timing, or workflow change needs its own rationale.

For each proposal, choose the first mechanism in this order that would have prevented or shortened the finding:
1. A deterministic check: schema or argument validation with a corrective error, a lint rule, a test, or a hook.
2. A change to the tool's behavior or result, such as a default, a completeness marker, or a next-step hint in the output.
3. A rule enforced at review, when the mistake is visible in a diff and needs judgement.
4. On-demand guidance: a doc or skill reached through a pointer at the decision point.
5. Always-injected guidance: a tool description, \`promptSnippet\`, \`promptGuidelines\`, or \`AGENTS.md\`/\`CLAUDE.md\`. Use these for selection, valid arguments, safety, and navigation pointers only.

A mechanical mistake (a fixed argument shape, a banned combination, a wrong path form) gets mechanism 1 or 2, not new prose. When proposing a lower-ranked mechanism, say in one clause why the higher ones do not fit.

## Report

Use the structure below, within 600 words; shorter when evidence is sparse. Prioritize consequential findings rather than filling categories or a recommendation quota. Use evidence labels to express uncertainty; add prose caveats only when they change the proposed action. Omit empty sections. If no SuPi surface was used or relevant, say so explicitly and omit unsupported findings and recommendations.

## SuPi Tooling Retrospective

**Task**: <one sentence, including actual completion status>

**Verdict**: <overall contribution and highest-leverage tooling opportunity, or no tooling change warranted>

### What helped
- \`[observed · impact: high|medium|low]\` **\`<surface>\`** — <concrete contribution; evidence anchor>.

### Failures and friction
- \`[observed|inferred · impact: high|medium|low]\` **\`<surface>\`** — <finding; evidence anchor; task effect>. <Cause or ownership, separately labeled if inferred or unknown. Include retry outcomes where visible.>

### Tooling improvements
Include at most three prioritized proposals tied to reported findings: **owner / named surface → mechanism → specific change → expected benefit → validation**. Name the editable surface and changed behavior; use a file path only if known. Mark untested changes and benefits \`[inferred]\`. Choose one smallest next experiment per proposal, with an observable success criterion. Keep larger alternatives conditional on that result. When evidence is insufficient to choose a change, name the narrow verification that would decide it. Preserve selection, argument validity, and safety in context-reduction proposals. If none emerge, state \`No tooling change warranted by the available evidence.\`

### Agent lessons
<At most two task-specific execution lessons, separate from tooling improvements. Omit when there are none.>

### Evidence limits
<State only limits that materially affect the findings or proposals; omit inventories of unassessed internals. Distinguish incomplete evidence from an uneventful observed task.>`;
