---
name: supi-flow-debug
description: Systematic debugging protocol — find the root cause before proposing fixes.
---

# Systematic Debugging

Random fixes waste time and often create new bugs. Debug by understanding the cause first.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you have not completed Phase 1, you are not ready to propose a fix.

## When to use

Use this when:

- a test fails during `/supi-flow-apply` and the cause is not obvious
- a build error blocks progress
- behavior does not match expectations
- a previous fix did not work
- you are tempted to "just try something"

Use it especially when you are under pressure, already tried multiple fixes, or do not fully understand the issue.

## Phase 1: Root cause investigation

Before changing anything:

### 1.1 Read the evidence carefully

- Read error messages, warnings, and stack traces fully.
- Note exact file paths, line numbers, inputs, and error codes.
- Do not summarize before you understand what the tools actually said.

### 1.2 Reproduce consistently

- Can you trigger it on demand?
- What exact steps produce it?
- Does it always happen, or only sometimes?

If you cannot reproduce it reliably, gather more data before guessing.

### 1.3 Check recent changes

- What changed just before the problem appeared?
- Review `git diff`, recent edits, config changes, environment changes, and dependency changes.

### 1.4 Trace data flow

When the symptom appears deep in the stack, trace backward:

- where did the bad value or bad state come from?
- what called this layer?
- what assumptions were already broken before the visible error?

Fix the source, not the symptom.

### 1.5 Isolate multi-component failures

For issues that cross boundaries like CLI to tool to service or UI to handler to storage:

- inspect inputs at each boundary
- inspect outputs at each boundary
- verify config and environment propagation
- narrow down which layer first becomes wrong

Add minimal diagnostic logging or instrumentation if needed to find the failing layer.

## Phase 2: Pattern analysis

Before fixing, understand what "correct" looks like:

1. Find similar working code in the same codebase.
2. Compare against the reference pattern completely.
3. List every meaningful difference.
4. Check dependencies, assumptions, settings, and required context.

Do not assume a small difference is irrelevant.

## Phase 3: Hypothesis and testing

Use one hypothesis at a time:

1. State the hypothesis clearly: `I think X is the root cause because Y.`
2. Make the smallest change or probe that tests that idea.
3. Verify the result.
4. If it failed, form a new hypothesis instead of stacking more guesses on top.

If you still do not understand the issue after investigation, say so and ask the user.

## Phase 4: Implementation

Once the cause is understood:

1. Create the smallest failing reproduction you reasonably can.
2. Implement one fix aimed at the root cause.
3. Verify that the issue is fixed.
4. Check for regressions.

## The 3-fix rule

```text
If 3 fixes have failed, stop and question the architecture.
Do not attempt fix #4 without discussing it with the user.
```

Signs this may be an architectural issue:

- each fix reveals a new problem elsewhere
- the fix requires unexpectedly large restructuring
- the same class of bug keeps appearing in different places

## Red flags

If you catch yourself thinking any of these, stop and go back to Phase 1:

- "Quick fix for now, investigate later"
- "Let me try changing X"
- "I probably know what this is"
- "I'll fix several things at once"
- "I'll skip the failing test"
- "One more fix attempt" after multiple failed tries

## When to hand off to the user

Ask the user when:

- the root cause is still unclear after real investigation
- the likely fix expands beyond the approved scope
- a required dependency or environment is missing
- 3 fixes have already failed
- you need a judgment call about trade-offs, risk, or test strategy

## Quick reference

| Phase | Focus | Success criteria |
|---|---|---|
| 1. Root cause | Evidence, reproduction, recent changes, data flow | You understand what failed and why |
| 2. Pattern | Working examples and differences | You know what "correct" looks like |
| 3. Hypothesis | One theory at a time | Hypothesis confirmed or replaced |
| 4. Implementation | Minimal root-cause fix | Issue resolved without regressions |

## Related skills

- Return to `/supi-flow-apply` after debugging.
- Use the plan's TDD or verification steps when implementing the fix.
