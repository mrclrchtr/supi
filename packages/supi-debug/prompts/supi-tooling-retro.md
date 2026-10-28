---
description: Assess SuPi tooling for the preceding task with evidence-linked improvements
---

Produce a compact retrospective of the task immediately preceding this prompt. Assess SuPi tooling, not the project's code or general development practices. Cover relevant tools, skills, prompts, extensions, injected guidance, docs, settings, and human-only TUI commands—not the suite in the abstract. Look for ways to reduce baseline model-input tokens while preserving correct tool selection and use.

## Scope and evidence

1. Identify the preceding task and its actual completion status from the visible session. If no task is identifiable, state that limit and stop. Keep unrelated tasks and this retrospective's own verification outside the assessment.
2. Use the task transcript as the primary evidence. If verification would materially change a finding or recommendation, make at most two narrowly filtered `debug` calls against the live session, using sanitized data only. Use only events attributable to this task. A retained buffer can omit earlier events; empty or incomplete results do not establish that nothing failed. If verification is unavailable, disclose the limit and proceed.
3. Make no other tool calls or follow-up investigation. Historical scans, delegation, file edits, issue creation, settings changes, and continuing the task are outside this retrospective. Stop after the report.

For each finding, give a brief evidence anchor: a tool result or error, a retry, a user correction, or a specific instruction/context excerpt. Use exact surface names from the session. Keep excerpts minimal and omit secrets or unnecessary identifying details.

Use these evidence labels:
- `[observed]`: directly supported by the visible transcript or verification result.
- `[inferred]`: a plausible interpretation or missed benefit, not demonstrated.
- `[unknown]`: an unresolved cause, ownership, or measurement; not a standalone finding.

Separate the observed outcome from its explanation. An observed failure does not make its suspected cause observed. Attribute problems to SuPi, agent misuse, or upstream Pi/provider behavior only when supported; otherwise mark ownership or cause `[unknown]`. Keep upstream behavior and project-code defects out of SuPi bug claims.

Rate each finding's impact on this task as `high`, `medium`, or `low`, based on the demonstrated effect or explicitly inferred benefit. Report time, token, cache, or cost figures only when measured in the task evidence; describe unmeasured costs qualitatively. Claims about recurring problems or suite-wide reliability require evidence beyond this retrospective's scope.

## Assessment checklist

Consider each category, but report each finding once:
- **Help:** What a used surface enabled, including useful guidance or context—not just a list of calls.
- **Tool guidance quality:** Assess visible tool descriptions, parameter explanations, `promptSnippet`, `promptGuidelines`, and result guidance for clarity, correctness, and sufficiency at the decision point. Rate relevant guidance as `effective`, `needs improvement`, or `not assessable`, citing evidence. Distinguish unclear guidance from the agent failing to follow clear guidance.
- **Baseline token cost:** Audit visible recurring tool metadata and injected guidance separately from result text and on-demand content. Look for duplicated facts, prose already expressed by schema constraints, implementation detail, and post-call instructions. Propose exact deletions, shorter wording, or on-demand destinations, explaining why pre-call selection, argument validity, and safety remain supported. Non-use in this task alone does not justify removal. Mark uncertain request placement `[unknown]`; quantify savings only from task evidence.
- **Failures and retries:** Rejected, failed, or mis-parameterized SuPi calls, including ones corrected on retry. Name the relevant parameter or error and eventual outcome. Distinguish agent misuse, ambiguous descriptions, missing guidance, schema gaps, and tool bugs; leave the cause unknown when the evidence cannot decide.
- **Defects:** Wrong output, crashes, regressions, or inconsistent behavior under valid usage. Label suspected defects as inferred and state what remains unverified.
- **Missed or missing help:** A specific unused surface or absent capability that plausibly would have changed this task. For unused surfaces, establish that they were available and relevant at the decision point; non-use alone is not a gap. Infer a reason such as discoverability, guidance, or timing only when supported.
- **Noise:** Identify redundant, stale, misleading, oversized, or poorly timed results/on-demand context and their avoidable cost. Explain what could be reduced or deferred while preserving necessary guidance.

## Report

Use the structure below, within 600 words; shorter when evidence is sparse. Prioritize consequential findings rather than filling categories. If a findings section is empty, write `None observed in the available task context.` If no SuPi surface was used or relevant, say so explicitly and omit unsupported findings and recommendations.

## SuPi Tooling Retrospective

**Task**: <one sentence, including actual completion status>

**Verdict**: <overall contribution and biggest supported improvement, or no change warranted>

### What helped
- `[observed · impact: high|medium|low]` **`<surface>`** — <concrete contribution; evidence anchor>.

### Friction and gaps
- `[observed|inferred · impact: high|medium|low]` **`<surface>`** — <category and finding; evidence anchor; task effect>. <Cause or ownership, separately labeled if inferred or unknown. For failed calls, include the retry outcome if visible.>

### Prioritized changes
Include at most three recommendations, each tied to a reported finding: **named changeable surface → specific change → expected benefit**. Rank by likely benefit to task effectiveness or baseline token reduction; mark benefits as untested. Prefer the smallest intervention that addresses the evidence, including guidance/schema fixes for misuse. Recommend increased tool use only when a supported discoverability or guidance gap explains the miss. If no change is supported, write `None warranted by the available evidence.`

### Evidence limits
<Briefly state material limits: missing or compacted task context, unavailable verification, uncertain attribution, or unmeasured costs. Distinguish an uneventful observed task from incomplete evidence.>
