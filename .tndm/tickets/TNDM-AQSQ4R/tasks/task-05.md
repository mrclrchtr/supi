# Task 5: Update code-intelligence docs and workflow notes for active code_context

# Goal
Bring the user-facing and maintainer-facing docs into line with the new additive `code_context` surface.

# Files
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`
- `packages/supi-code-intelligence/src/workflow/names.ts`
- `packages/supi-code-intelligence/src/workflow/surface.ts`

# Change
Update the docs/notes so they match the implemented state:

1. Mark `code_context` as active in the workflow roadmap.
2. Describe `code_context` as the task-focused successor to `code_brief` while clarifying that `code_brief` still exists as the compatibility/orientation tool in this phase.
3. Update maintainer notes and workflow comments so they no longer describe `code_context` as planned-only metadata.
4. Keep the wording honest about what `code_context` does in this first implementation wave.

# Verification
This task is **test-exempt** because it is documentation/roadmap alignment only.

Run:

```bash
rg -n 'code_context|planned \(Phase 2\)|active|compatibility|orientation' \
  packages/supi-code-intelligence/README.md \
  packages/supi-code-intelligence/CLAUDE.md \
  packages/supi-code-intelligence/src/workflow/names.ts \
  packages/supi-code-intelligence/src/workflow/surface.ts
```

Expected result: the matched lines describe `code_context` as active/additive and do not leave stale “planned-only” wording in the touched files.

# Test-exempt rationale
The task changes prose and roadmap comments, not executable behavior. Manual verification through exact `rg` checks is sufficient here.
