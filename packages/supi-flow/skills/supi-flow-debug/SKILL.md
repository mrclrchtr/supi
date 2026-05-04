---
name: supi-flow-debug
description: Systematic debugging protocol — root cause before fixes. Load on demand when blocked during /supi-flow-apply (test failures, build errors, unexpected behavior).
disable-model-invocation: true
---

# Systematic Debugging

Random fixes waste time and create new bugs. Symptom fixes mask underlying issues.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## When to use

Load this skill when:
- A test fails during `/supi-flow-apply` and you don't understand why
- A build error blocks progress
- Unexpected behavior surfaces during implementation
- You've already tried a fix and it didn't work
- You're about to say "let me just try changing X"

Use this ESPECIALLY when:
- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You've already tried 2+ fixes
- You don't fully understand the issue

## Phase 1: Root cause investigation

**BEFORE attempting ANY fix:**

### 1.1 Read error messages carefully
- Don't skip past errors or warnings
- Read stack traces completely — note line numbers, file paths, error codes
- They often contain the exact solution

### 1.2 Reproduce consistently
- Can you trigger it reliably?
- What are the exact steps?
- Does it happen every time?
- If not reproducible → gather more data, don't guess

### 1.3 Check recent changes
- What changed that could cause this?
- `git diff` — what did you just edit?
- New dependencies, config changes, environmental differences?

### 1.4 Trace data flow (for multi-component systems)

When the error is deep in a call stack, trace backward:
- Where does the bad value originate?
- What called this with the bad value?
- Keep tracing up until you find the source
- Fix at source, not at symptom

For component boundaries (API → service → database etc.), add diagnostic instrumentation at each boundary to isolate the failing layer.

## Phase 2: Pattern analysis

Before fixing, understand the pattern:

1. **Find working examples** — locate similar working code in the same codebase
2. **Compare against references** — if implementing a pattern, read the reference implementation completely. Don't skim.
3. **Identify differences** — what's different between working and broken? List every difference, however small. Don't assume "that can't matter."
4. **Understand dependencies** — what other components does this need? What settings, config, environment? What assumptions does it make?

## Phase 3: Hypothesis and testing

Scientific method, one variable at a time:

1. **Form a single hypothesis** — state clearly: "I think X is the root cause because Y." Be specific.
2. **Test minimally** — make the SMALLEST possible change to test the hypothesis. One variable at a time. Don't fix multiple things at once.
3. **Verify before continuing** — did it work? Yes → Phase 4. No → form a NEW hypothesis. Don't add more fixes on top.
4. **When you don't know** — say "I don't understand X." Don't pretend. Ask for help.

## Phase 4: Implementation

Fix the root cause, not the symptom:

1. **Create a failing test case** — simplest possible reproduction. Must have before fixing.
2. **Implement a single fix** — address the root cause identified. ONE change at a time. No "while I'm here" improvements.
3. **Verify fix** — test passes now? No other tests broken? Issue actually resolved?
4. **If fix doesn't work** — STOP. Count: how many fixes have you tried?

## The 3-fix rule

```
If ≥ 3 fixes have failed: STOP and question the architecture.
Do NOT attempt fix #4 without discussing with the user.
```

**Pattern indicating architectural problem:**
- Each fix reveals a new problem in a different place
- Fixes require "massive refactoring" to implement
- Each fix creates new symptoms elsewhere

This is not a failed hypothesis — this is a wrong architecture. Discuss fundamentals with the user.

## Red flags — STOP and return to Phase 1

If you catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "Skip the test, I'll manually verify"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "One more fix attempt" (when already tried 2+)
- Proposing solutions before understanding root cause

**ALL of these mean: STOP. Return to Phase 1.**

## Rationalization prevention

| Excuse | Reality |
|--------|---------|
| "Issue is simple, don't need process" | Simple issues have root causes too. Process is fast for simple bugs. |
| "Emergency, no time for process" | Systematic debugging is FASTER than guess-and-check thrashing. |
| "Just try this first, then investigate" | First fix sets the pattern. Do it right from the start. |
| "I'll write test after confirming fix works" | Untested fixes don't stick. Test first proves it. |
| "Multiple fixes at once saves time" | Can't isolate what worked. Causes new bugs. |
| "I see the problem, let me fix it" | Seeing symptoms ≠ understanding root cause. |
| "One more fix attempt" (after 2+ failures) | 3+ failures = architectural problem. Question approach, don't fix again. |

## Quick reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| 1. Root Cause | Read errors, reproduce, check changes, trace data flow | Understand WHAT and WHY |
| 2. Pattern | Find working examples, compare, identify differences | Know what's different |
| 3. Hypothesis | Form theory, test minimally | Confirmed or new hypothesis |
| 4. Implementation | Create test, fix, verify | Bug resolved, tests pass |

## When to hand off to user

- 3+ fixes have failed → question architecture with user
- Root cause is unclear after completing Phase 1 → present findings and ask
- Fix requires changes outside the current change scope → ask before expanding
- You need environment access you don't have → explain what you need

## Related skills

- After debugging: return to `/supi-flow-apply` to continue task execution
- For TDD test creation: follow the plan's red-green-refactor steps
