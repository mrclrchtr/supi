# Task 5: Update LSP and code-intelligence docs for the always-on policy and degraded-coverage warnings

## Goal
Bring user-facing and maintainer-facing docs in line with the new coverage policy and warning behavior.

## Files
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`
- `packages/supi-lsp/README.md`
- `packages/supi-lsp/CLAUDE.md`

## Change
- Remove documentation that tells users to disable LSP globally with `lsp.enabled`.
- Remove documentation that tells users to limit startup via `lsp.active`.
- Replace those sections with the supported per-language opt-out model using `lsp.servers.<language>.enabled: false`.
- Document the degraded-coverage warning behavior for:
  - explicit per-language disable
  - missing server binaries
  - Tree-sitter startup failure
  - deprecated keys that are ignored
- Keep the examples concrete and consistent with the implementation paths used by the settings UI.

## Verification
- Run `rg -n "lsp\.enabled|lsp\.active|Disabled Servers|enabled: false" packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md packages/supi-lsp/README.md packages/supi-lsp/CLAUDE.md`.
- Confirm the remaining matches either document deprecation/ignored-key behavior or the new per-language disable model, and no longer instruct users to rely on the removed broad controls.

## Test exemption
This task is test-exempt because it is documentation-only.

### Rationale
The work changes guidance, not executable logic.

### Manual verification
Review the rendered markdown locally and confirm the examples, terminology, and config paths match the implemented runtime behavior.
