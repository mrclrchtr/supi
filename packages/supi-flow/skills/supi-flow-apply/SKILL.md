---
name: supi-flow-apply
description: Execute an approved implementation plan task by task — verify each step fresh, stop when blocked, and ask instead of guessing.
---

# Execute implementation plan

## The Iron Law

```
EVERY TASK GETS FRESH VERIFICATION BEFORE MARKING DONE
```

If you haven't run the verification command for this task, you cannot check it off. Previous runs do not count. "Should pass" is not evidence.

## Step 1: Find the plan

- If a TNDM-ID was given as argument: `tndm ticket show <ID>`, read the Plan section. Mark the ticket as in progress: `tndm ticket update <ID> --status in_progress`
- Otherwise: scan recent conversation for the most recent `/supi-flow-plan` output.
- If no plan is available: ask which change to implement.

## Step 2: Review the plan critically

Read the whole plan before starting.

Raise questions before editing if:

- the plan has a gap
- the instructions are unclear
- the scope changed
- a task is missing verification
- you are unsure whether a task should be test-driven or test-exempt

Do not start implementation until those concerns are resolved.

## Step 3: Execute tasks

For each unchecked task, in order:

1. Announce which task you are working on.
2. Follow the task as written.
3. Run the verification for that task and read the result carefully.
4. If verification passes: check the task off.
5. If verification fails: stop, diagnose, fix, and re-verify before moving on.
6. Record what actually passed.

Do not skip failed checks. Do not collapse several tasks into one vague batch.

### TDD by default, not always

For tasks that involve writing code, prefer TDD when the code is reasonably testable.

```text
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Default flow:

1. Write the test.
2. Run it and confirm it fails for the right reason.
3. Write the minimal code to make it pass.
4. Re-run the test and confirm it passes.
5. Run any broader regression checks the plan calls for.

### Test-exempt work

If the task is marked test-exempt in the plan, or the work is clearly not practical to drive with TDD, use manual verification instead.

Examples:

- docs-only edits
- config-only edits
- trivial changes
- shell or integration work with no reasonable harness

For test-exempt work:

1. Run the manual verification step from the plan.
2. If the plan omitted one, add the smallest concrete verification you can justify.
3. Confirm the actual output matches the claim.
4. Note the exemption rationale briefly when you report completion.

If you are **uncertain** whether TDD is practical, ask the user instead of guessing.

The hard rule is not "TDD in every case." The hard rule is: **no unverified changes**.

## Step 4: When blocked, load systematic debugging

If verification fails and you do not understand why, load `/skill:supi-flow-debug` and follow it before attempting random fixes.

## When to stop and ask

STOP and ask the user when:

- a verification fails repeatedly and you still do not understand the cause
- you have tried 3 fixes and none worked
- a dependency is missing
- the plan has a critical gap
- an instruction is unclear
- you are unsure whether a task should use TDD or a test exemption

Do not guess. Do not force through blockers.

## Rationalization prevention

| Excuse | Reality |
|--------|---------|
| "Should pass now" | Run the verification again. Fresh. |
| "I'm confident" | Confidence is not evidence. |
| "Just this once" | Verification still applies. |
| "Previous run passed" | Code changed. Run it again. |
| "This task is too simple to need TDD" | TDD is preferred for testable code. If it is truly not practical, verify it manually and say why. |

## When all tasks are done

- **If a ticket exists:** update the Verification section with the actual results. Do not mark it done yet — `/supi-flow-archive` handles closeout.
- Announce: `Implementation complete. Run /supi-flow-archive [TNDM-XXXXXX] to verify, update docs, and close out.`
