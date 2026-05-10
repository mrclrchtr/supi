---
name: supi-flow-plan
description: Create an implementation plan for an approved design with exact file paths, ordered tasks, concrete verification, and no placeholders.
---

# Create implementation plan

## Step 1: Find the design

- If a TNDM-ID was given as argument: `tndm ticket show <ID>`, read the Intent/Design sections.
- Otherwise: scan recent conversation for the most recent `/supi-flow-brainstorm` outcome.
- If no design is available: ask which change to plan.

## Step 2: Scope check

If the design covers multiple independent subsystems, suggest splitting it into separate plans. Each plan should produce a coherent, testable result.

## Step 3: Choose the right detail level

Use **adaptive detail by complexity**:

- **Light plan** for small or familiar changes: clear tasks, files, verification, and constraints.
- **Fuller executable plan** for risky, unfamiliar, multi-file, or high-impact changes: more explicit steps, commands, and snippets when they reduce ambiguity.

Do not add ceremony for its own sake.

## Step 4: Map file structure

Before writing tasks, list which files will be created or modified and what each is responsible for.

- Use exact file paths.
- Prefer focused units with clear responsibilities.
- Follow existing codebase patterns.
- Include doc targets when the change affects user-facing or maintainer-facing behavior.

## Step 5: Write ordered tasks

A good plan is broken into small, verifiable tasks. For each task, include:

- the goal
- exact file paths
- the change to make
- how to verify it
- whether it is test-driven or explicitly test-exempt

Use enough detail that an agent can execute without guessing, but do not force huge code blocks into every step.

## TDD by default

For testable code changes, prefer red-green-refactor:

```text
RED → write the failing test → verify it fails for the right reason
GREEN → write the minimal code to pass → verify it passes
REFACTOR → clean up while staying green
```

Critical rule: if you did not watch the test fail, you do not know whether it proves the behavior.

### Test exemptions

TDD is the default, not an absolute rule.

A task may be marked **test-exempt** when TDD is not practical, such as:

- docs-only changes
- config-only changes
- trivial edits
- shell or integration work with no reasonable harness

Every test-exempt task MUST include:

- a brief rationale
- a concrete manual verification step
- the exact command and expected result when possible

Do not use test exemptions to avoid testing logic that could reasonably be tested.

## Rules

- **No placeholders.** Never write `TBD`, `TODO`, `implement later`, or vague instructions like `add error handling`.
- **Exact file paths** always.
- **Verification is mandatory.** Every task needs a concrete check.
- **No code before test or verification.** Testable code starts with a failing test. Test-exempt work starts with manual verification.
- **Include doc updates** when the change affects docs, help text, architecture notes, or workflow guidance.

## Self-review

After writing the plan, check it against the approved design:

1. **Coverage:** does every important requirement map to a task?
2. **Placeholder scan:** remove vague or incomplete instructions.
3. **Consistency:** do names, types, files, and steps line up across tasks?
4. **Right-sized detail:** is the plan clear without being bloated?

Fix issues inline before handing off.

## Output and persistence

Write the plan in the lightest form that will still survive execution:

- **If a ticket exists:** append the plan there if that is the best shared source of truth.
- **If no ticket exists:** default to conversation-first.
- **If the work is larger or likely multi-session:** offer saving the plan to a file.
- Close with: `Plan ready. Review it and approve before we start. Then run /supi-flow-apply [TNDM-XXXXXX].`
