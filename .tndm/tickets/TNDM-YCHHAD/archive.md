# Archive

## Verification Results

**Task 1**: Added `peerDependenciesMeta` marking pi-provided deps as optional in all 16 sub-packages:
- supi-core, supi-ask-user, supi-bash-timeout, supi-claude-md, supi-context, supi-debug, supi-extras, supi-lsp, supi-tree-sitter, supi-code-intelligence, supi-cache, supi-review, supi-rtk, supi-insights, supi-web, supi-test-utils

**Task 2**: Initial attempt with sub-package peerDependenciesMeta alone was insufficient.
- The meta-package (packages/supi/package.json) also declares `@earendil-works/pi-coding-agent` as a peer dep without marking it optional.
- npm still auto-installs pi-coding-agent, which pulls in pi-tui → koffi → build failure.
- **Final fix**: Added `peerDependenciesMeta` to the meta-package as well.
- Verified: `npm install -g` from staged tarball succeeded (added 2 packages, no koffi build triggered)

**Task 3**: Workspace verification:
- TypeScript typecheck: ✅ (no errors)
- All 1586 tests pass across 152 test files: ✅
- Biome checks on all 16 edited package.json files: ✅ (no fixes needed)

