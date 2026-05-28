# Task 6: Update CLAUDE.md and README.md — remove code_pattern docs

Update package documentation to reflect the removal of `code_pattern`.

**Files:**
- `packages/supi-code-intelligence/CLAUDE.md`:
  - L6: Remove `code_pattern` from the tool name list in the extension description
  - L93: Remove `execute-pattern.ts` from the architecture tree
  - L139: Remove `pattern.ts` from the presentation tree (only if it's no longer needed — verify it's still used by code_find; if code_find uses it, keep it but update description)
  - L154–166: Remove the `### code_pattern` section; update the `### code_find` section to remove "code_pattern remains available during the transition" and "Prefer code_find over code_pattern for new searches" — now code_find is the sole search tool
  - L192: Remove the Public-surface split note about code_pattern being the sole heuristic tool — code_find fills that role now
  - Update any remaining "11 tools" or tool count references
- `packages/supi-code-intelligence/README.md`:
  - L36: Remove `code_pattern` from the tool list
  - L98–138: Remove the `### code_pattern` section
  - L138: Remove or update the `heuristic` concern note

**Verification:** Read both files and confirm no `code_pattern` references remain (other than historical mentions in workflow/surface.ts or changelog sections)
