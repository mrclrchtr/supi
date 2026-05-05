---
name: supi-flow-archive
description: Verify implementation against plan, update living documentation, run slop detection, close out the change. Use after /supi-flow-apply when all tasks are done.
---

# Archive and document

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

Before claiming any task is done, the change is complete, or docs are accurate: run the command fresh, read the full output, check exit codes. Only then make the claim.

## Step 1: Find the change

- If a TNDM-ID was given as argument: `tndm ticket show <ID>`
- Otherwise: scan recent conversation for the most recent `/supi-flow-apply` or `/supi-flow-plan` output.
- If nothing found: ask which change to archive.

## Step 2: Verify completion

Compare the plan against what was actually done. Run every check fresh — previous runs don't count.

- [ ] Every task checked? If not, complete remaining tasks first.
- [ ] Tests pass? Run the test command fresh. Confirm zero failures. Show the output.
- [ ] Intent satisfied? Re-read the Intent section — does the implemented change match?
- [ ] Verification plan executed? Run every verification command listed in the plan. Record actual results.

If anything fails: stop. Fix before continuing. Do not proceed to documentation with unverified claims.

### Verification gate function

```
BEFORE claiming any status:
1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code
4. CONFIRM: Does output match the claim?
   - NO → State actual status with evidence
   - YES → State claim WITH evidence
5. ONLY THEN: Proceed

Skip any step = lying, not verifying
```

### Red flags — STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Done!", etc.)
- Trusting previous test runs
- Relying on partial verification
- ANY wording implying success without having run verification

## Step 3: Update living documentation

From the design's "Docs to update" section (or infer from what changed):

1. **Collect context:** review `git diff` to understand the actual delta.
2. **Identify targets:** which files need updates? (READMEs, INDEX.md, architecture docs, package docs)
3. **Apply edits:** update each target with grounded, specific language — explain what changed and why. Reference actual commands, filenames, configuration options.

## Step 4: Slop scan — REQUIRED

Load `/skill:supi-flow-slop-detect` and scan every edited documentation file. This is mandatory before close-out.

### Quality gate checklist

Verify against this checklist:

- [ ] No tier-1 slop words in edited docs
- [ ] Em dash count < 3 per 1000 words
- [ ] Bullet ratio < 40% (unless listing is appropriate)
- [ ] All claims grounded with specifics (version numbers, file paths, measurements)
- [ ] No formulaic openers or closers ("In conclusion", "To summarize")
- [ ] No AI-sycophantic phrases ("Great question!", "I'd be happy to")
- [ ] Slop score < 1.5

If any gate fails: fix, re-scan, verify score is below threshold. Do not proceed until clean.

## Step 5: Verify accuracy

Do version numbers, file paths, and claims in the docs match the actual code? Run specific commands to confirm instead of assuming.

## Step 6: Close out

- **If ticket exists:** `tndm ticket update <ID> --status done`. Commit `.tndm/` changes.
- **If no ticket:** announce completion.

## Step 7: Commit everything

```sh
# Stage only the files changed by this workflow — review the list first
git add <changed files>
git diff --cached --stat  # review what's being committed
git commit -m "<type>: <summary>

- <bullet of changes>
- <bullet of doc updates>"
```
