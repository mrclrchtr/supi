---
name: supi-flow-archive
description: Verify implementation against the plan, update living documentation, run slop detection, and close out the change.
---

# Archive and document

Use this after `/supi-flow-apply` when implementation is complete. This is a docs-first closeout step, not a repository-cleanup workflow.

## The Iron Law

```text
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

Before claiming the change is done, the docs are accurate, or the ticket can be closed: run the proof fresh, read the result, and check the exit status.

## Step 1: Find the change

- If a TNDM-ID was given as argument: `tndm ticket show <ID>`
- Otherwise: scan recent conversation for the most recent `/supi-flow-apply` or `/supi-flow-plan` output.
- If nothing is clear: ask which change to archive.

## Step 2: Verify completion

Compare the plan against what was actually done. Fresh checks only.

- [ ] Every planned task is complete, or any deviation is explained.
- [ ] Tests and verification commands were run fresh.
- [ ] The implemented result still matches the approved intent.
- [ ] Any claimed manual verification was actually performed.

If any check fails, stop and fix that first.

### Verification gate

```text
1. Identify the command or evidence that proves the claim.
2. Run it fresh.
3. Read the full result and exit code.
4. Confirm the claim matches the evidence.
5. Only then report success.
```

## Step 3: Update living documentation

Update docs only where the change actually affects them.

1. Review `git diff` to understand the real delta.
2. Identify the docs that should change.
3. Update them with grounded, specific language.
4. Reference actual file paths, commands, settings, or behavior when helpful.

## Step 4: Run slop detection

Load `/skill:supi-flow-slop-detect` and scan every edited documentation file.

Quality checks:

- no tier-1 slop words in edited docs
- claims are grounded in specifics
- wording is direct, not formulaic
- AI-sycophantic filler is removed
- the slop score is acceptable

If the scan fails, fix the docs and re-scan.

## Step 5: Verify doc accuracy

Do the docs match the actual code and workflow?

- check file paths
- check command names
- check settings or behavior descriptions
- check that new guidance matches the final implementation

Do not assume documentation is correct just because it sounds right.

## Step 6: Close out

- **If a ticket exists:** update it with the final verification results, then mark it done.
- **If no ticket exists:** announce completion with the actual evidence.

## Step 7: Commit if needed

If this workflow changed docs, ticket files, or other closeout artifacts, commit them with an accurate message.

## Red flags

Stop if you catch yourself:

- claiming success from an old test run
- saying "should" or "probably" instead of citing evidence
- updating docs before confirming the implementation
- treating this as a repository cleanup workflow instead of a verification-and-docs closeout
