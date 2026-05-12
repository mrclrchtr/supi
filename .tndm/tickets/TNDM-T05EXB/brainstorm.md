Three findings from production-readiness gate for supi-lsp, supi-tree-sitter, supi-code-intelligence:

1. Pack `../` paths: direct npm pack on supi-code-intelligence produces broken tarball due to nested bundledDependencies + pnpm hoisted symlinks. Fix by adding tarball verification to CI and formalizing publish path via pack-staged.mjs.

2. supi-lsp README: /lsp-status command lacks output format example.

3. gitignore-fallback warnings: all 3 packages lack .npmignore, causing noisy npm pack warnings.

Approach: Add verify-tarball.mjs, publish.mjs wrappers, update pack:check CI, add README section, add empty .npmignore files. No dependency restructuring.