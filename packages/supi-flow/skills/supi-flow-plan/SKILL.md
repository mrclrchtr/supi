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

Every code task follows red-green-refactor:

```
RED → Write failing test → VERIFY it fails for the right reason
GREEN → Minimal code to pass → VERIFY test passes + no regressions
REFACTOR → Clean up, stay green → then commit
```

Critical rule: **If you didn't watch the test fail, you don't know if it tests the right thing.** Every test step must include the expected failure message.

## Rules

- **No placeholders.** Never write: TBD, TODO, "implement later", "add error handling", "write tests for the above". Every step must contain the actual content.
- **Exact file paths** always.
- **Complete code** in every step — if a step changes code, show the code.
- **Exact commands** with expected output, including expected failure output for test steps.
- **Include doc updates** as tasks (from the design's "Docs to update" section).
- **No code before test.** Every task that produces code starts with a failing test step.

## Output

Write the plan:

- **If ticket exists:** append to ticket body under the `## Plan` section. Each task as `- [ ] X.Y Description`.
- **If no ticket:** present the plan in the conversation. The plan lives in context for this session.

After writing: "Plan ready. Review it and approve before we start. Then run `/supi-flow-apply [TNDM-XXXXXX]`."
