# Task 3: Update code_find docs to the strict evidence matrix

## Goal
Bring the user-facing and maintainer-facing docs into exact alignment with the new `code_find` contract.

## Files
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`

## Change
Update both docs so the `code_find` sections:
- describe the exact strict matrix from the approved design
- state that text/regex/semantic do not accept `kind`
- state that AST requires explicit `kind`
- list only `definition`, `import`, and `export` as supported AST kinds in this phase
- remove claims about semantic fallback to text search
- remove claims that text/regex ignore `kind`
- remove claims that AST `call` is supported
- remove claims that semantic kind-filtered search is supported in this phase

This task is **test-exempt** because it is documentation-only and the behavioral contract is already locked by tasks 1 and 2.

## Verification
1. Inspect the changed doc sections:
`git diff -- packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md`
2. Confirm stale claims are gone:
`rg -n "fell back to text search|kind is ignored|advisory-only|call-site matching via ripgrep|supported kinds for \`mode: \"semantic\"\`" packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md`

Expected result: the diff shows the strict matrix in both files, and the `rg` command prints no matches.
