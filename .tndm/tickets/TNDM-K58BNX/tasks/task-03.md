# Task 3: Update package docs for `code_inspect` and the narrowed `code_brief` contract

# Goal
Bring maintainer-facing and user-facing package docs in sync with the implemented public surface.

# Files
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`

# Change
1. Add `code_inspect` to the documented public tool list and describe it as the factual point-inspection tool.
2. Remove anchored-brief contract text from both docs.
3. Rewrite the `code_brief` documentation so it is clearly orientation-only.
4. Keep `code_health` as the diagnostics/refresh surface; do not add `code_diagnostics` language.
5. Update any examples or next-step guidance that still send point-inspection work to anchored `code_brief`.

# Verification
This is test-exempt because it is docs-only. Verify with search:

```bash
rg -n 'Anchored briefs|code_brief.*line|code_brief.*character|code_brief with `file:' \
  packages/supi-code-intelligence/README.md \
  packages/supi-code-intelligence/CLAUDE.md

rg -n 'code_inspect|orientation-only|code_health' \
  packages/supi-code-intelligence/README.md \
  packages/supi-code-intelligence/CLAUDE.md
```

Expected result:
- the first command returns no stale public-contract guidance about anchored `code_brief`
- the second command shows the new `code_inspect` and orientation-only documentation

# Test mode
Test-exempt: docs-only change with explicit grep-based verification.
