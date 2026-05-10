---
name: supi-flow-plan
description: Create an implementation plan for an approved design — bite-sized tasks, exact file paths, no placeholders. Use after /supi-flow-brainstorm when the design is approved.
---

# Create implementation plan

## Step 1: Find the design

- If a TNDM-ID was given as argument: `tndm ticket show <ID>`, read the Intent/Design sections.
- Otherwise: scan recent conversation for the most recent `/supi-flow-brainstorm` outcome.
- If no design found: ask which change to plan.

## Step 2: Scope check

If the design covers multiple independent subsystems, suggest splitting into separate plans. Each plan should produce working, testable software on its own.

## Step 3: Map file structure

Before defining tasks, list which files will be created or modified and what each is responsible for.

- Design units with clear boundaries. Each file should have one clear responsibility.
- Prefer smaller, focused files over large ones that do too much.
- In existing codebases, follow established patterns.

## Step 4: Write bite-sized tasks

Each task is one action (2-5 minutes):

- [ ] 1.1 Write the failing test — show actual test code
- [ ] 1.2 Run test to verify it fails — show exact command + expected output
- [ ] 1.3 Write minimal implementation — show actual code
- [ ] 1.4 Run test to verify it passes — show exact command + expected output
- [ ] 1.5 Commit — show exact commit message

## TDD by default

Every code task follows red-green-refactor, unless the approved design explicitly opts out:

```
RED → Write failing test → VERIFY it fails for the right reason
GREEN → Minimal code to pass → VERIFY test passes + no regressions
REFACTOR → Clean up, stay green → then commit
```

Critical rule: **If you didn't watch the test fail, you don't know if it tests the right thing.** Every test step must include the expected failure message.

### Test exemption

Individual tasks may be marked test-exempt with a brief rationale (e.g., "test-exempt: standalone shell script"). Exempt tasks skip red-green steps and instead include a concrete manual verification step (exact command + expected output). The rule becomes: **No code before verification.**

Use this sparingly — when there is no reasonable test harness or the change is trivial (config tweak, one-line script fix). Do not use it to avoid testing logic that could be tested.

## Rules

- **No placeholders.** Never write: TBD, TODO, "implement later", "add error handling", "write tests for the above". Every step must contain the actual content.
- **Exact file paths** always.
- **Complete code** in every step — if a step changes code, show the code.
- **Exact commands** with expected output, including expected failure output for test steps.
- **Include doc updates** as tasks (from the design's "Docs to update" section).
- **No code before test (or verification).** Every task that produces code starts with a failing test step, unless the task is test-exempt. For test-exempt tasks, start with the manual verification step.

## Self-review

After writing the complete plan, look at the brainstorm outcome with fresh eyes and check the plan against it. This is a checklist you run yourself — not a user review.

**1. Spec coverage:** Skim each section/requirement from the brainstorm outcome. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any TBD, TODO, "implement later", vague steps, or "similar to Task N" shortcuts. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a requirement with no task, add the task.

## Output

Write the plan:

- **If ticket exists:** append to ticket body under the `## Plan` section. Each task as `- [ ] X.Y Description`.
- **If no ticket:** present the plan in the conversation. The plan lives in context for this session.

After writing: "Plan ready. Review it and approve before we start. Then run `/supi-flow-apply [TNDM-XXXXXX]`."
