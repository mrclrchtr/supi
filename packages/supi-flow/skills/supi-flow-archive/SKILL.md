---
name: supi-flow-archive
description: Verify implementation against plan, update living documentation, run slop detection, close out the change. Use after /supi-flow-apply when all tasks are done.
---

# Archive and document

## Step 1: Find the change

- If a TNDM-ID was given as argument: `tndm ticket show <ID>`
- Otherwise: scan recent conversation for the most recent `/supi-flow-apply` or `/supi-flow-plan` output.
- If nothing found: ask which change to archive.

## Step 2: Verify completion

Compare the plan against what was actually done:

- [ ] Every task checked? If not, complete remaining tasks first.
- [ ] Tests pass? Run the test command fresh and confirm zero failures.
- [ ] Intent satisfied? Re-read the Intent section — does the implemented change match?
- [ ] Verification plan executed? Run every verification command listed in the plan. Record actual results.

If anything fails: stop. Fix before continuing.

## Step 3: Update living documentation

From the design's "Docs to update" section (or infer from what changed):

1. **Collect context:** review `git diff` to understand the actual delta.
2. **Identify targets:** which files need updates? (READMEs, INDEX.md, architecture docs, package docs)
3. **Apply edits:** update each target with grounded, specific language — explain what changed and why. Reference actual commands, filenames, configuration options.
4. **Quality scan:** run slop detection. Load `/skill:supi-flow-slop-detect`, scan the edited docs, fix any AI-prose markers found.
5. **Verify accuracy:** do version numbers, file paths, and claims in the docs match the actual code?

## Step 4: Close out

- **If ticket exists:** `tndm ticket update <ID> --status done`. Commit `.tndm/` changes.
- **If no ticket:** announce completion.

## Step 5: Commit everything

```sh
# Stage only the files changed by this workflow — review the list first
git add <changed files>
git diff --cached --stat  # review what's being committed
git commit -m "<type>: <summary>

- <bullet of changes>
- <bullet of doc updates>"
```
