---
name: supi-flow-apply
description: Execute implementation plan task by task — stop when blocked, commit after each step, verify before claiming done. Use after /supi-flow-plan when the plan is approved.
---

# Execute implementation plan

## Step 1: Find the plan

- If a TNDM-ID was given as argument: `tndm ticket show <ID>`, read the Plan section. Mark the ticket as in_progress: `tndm ticket update <ID> --status in_progress`
- Otherwise: scan recent conversation for the most recent `/supi-flow-plan` output.
- If no plan found: ask which change to implement.

## Step 2: Review the plan critically

Read every task. Identify any questions, gaps, or concerns BEFORE starting. If something is unclear, missing, or wrong: raise it with the user. Do not start implementation until concerns are resolved.

## Step 3: Execute tasks

For each unchecked task in order:

1. Announce which task you're working on.
2. Follow the step exactly as written.
3. Run verifications as specified — check exit codes, read output.
4. If verification passes: check the task box.
5. If verification fails: stop, diagnose, fix, re-verify. Do not skip.
6. Commit after each completed task.

## When to stop

STOP executing and ask when:
- A verification fails repeatedly and you don't understand why.
- A dependency is missing.
- The plan has a critical gap.
- You don't understand an instruction.

Do NOT guess. Do NOT force through blockers. Ask for clarification.

## When all tasks are done

- **If ticket exists:** update the Verification section with actual results. Do NOT mark as done — `/supi-flow-archive` handles that.
- Announce: "Implementation complete. Run `/supi-flow-archive [TNDM-XXXXXX]` to verify, update docs, and close out."
