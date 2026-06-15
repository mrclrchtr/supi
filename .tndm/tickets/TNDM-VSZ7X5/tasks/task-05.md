# Task 5: Update code-intelligence docs for shared test discovery and impact commands

## Goal

Document the changed user-facing and maintainer-facing behavior so future tool changes preserve consistent test discovery across `code_graph`, `code_context`, and `code_impact`.

## Files

- Modify `packages/supi-code-intelligence/README.md`
- Modify `packages/supi-code-intelligence/CLAUDE.md`

## Changes

1. In `README.md`, update the `code_graph`, `code_context`, and `code_impact` sections:
   - state that test discovery uses semantic import/reference evidence plus deterministic test-file conventions
   - mention package-level mirrors such as `__tests__/unit/...`
   - mention that `code_impact` can include likely test commands when tests are found.
2. In `CLAUDE.md`, update the public tool contracts and gotchas:
   - identify `src/analysis/relations/tests.ts` as the shared test discovery source of truth
   - note that graph/context/impact must not implement divergent test lookup rules
   - note that impact must include the target file itself as affected evidence for target-based analysis.

## Verification

This task is test-exempt because it is docs-only. Manual verification:

```bash
rg -n "test discovery|Likely Test Commands|includeTests|analysis/relations/tests" \
  packages/supi-code-intelligence/README.md \
  packages/supi-code-intelligence/CLAUDE.md
```

Expected result: matches show the new shared test-discovery and likely-test-command behavior in both docs files.

## Test status

Test-exempt: docs-only change with concrete manual verification command.
