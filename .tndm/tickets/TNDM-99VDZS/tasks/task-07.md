# Task 7: Update CLAUDE.md — remove lsp_hover from known absorption gaps

## Goal

Update CLAUDE.md to mark the lsp_hover absorption gap as resolved.

## Change

In `packages/supi-code-intelligence/CLAUDE.md`, under "Known absorption gaps":

1. Remove the `lsp_hover` entry:
   ```diff
   - - **lsp_hover**: type/signature hover info is not currently absorbed...
   ```

2. The remaining gaps (`lsp_code_actions`, `lsp_definition`) stay untouched.

## Verification
- CLAUDE.md no longer lists lsp_hover as an absorption gap

