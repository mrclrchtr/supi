## Overview
Fix the published `@mrclrchtr/supi` meta-package so bundled SuPi sub-packages can resolve their own third-party runtime dependencies after a normal `npm install`.

### Root cause
The meta-package packing path in `scripts/pack-staged.mjs` stages bundled workspace tarballs under `node_modules/@mrclrchtr/*`, but it does not carry forward the bundled packages' external runtime dependencies into the staged meta-package install surface. As a result, bundled extensions such as `@mrclrchtr/supi-lsp`, `@mrclrchtr/supi-tree-sitter`, and `@mrclrchtr/supi-extras` are present, but their runtime imports like `typescript`, `web-tree-sitter`, and `clipboardy` are absent when the packed meta-package is installed.

### Approach
Update the meta-package staging pipeline to compute the union of third-party runtime dependencies required by bundled `@mrclrchtr/*` packages and inject those dependencies into the staged `packages/supi` root manifest before `npm pack`. Keep workspace-package dependencies bundled as they already are; only promote non-`@mrclrchtr/*` runtime dependencies that the bundled packages need at install time.

### Scope
- Modify `scripts/pack-staged.mjs` to derive and apply external runtime dependencies for the staged meta-package manifest.
- Add packaging regression coverage that proves a packed `@mrclrchtr/supi` install exposes required external dependencies for bundled packages.
- Keep the fix localized to packaging and verification; do not refactor unrelated package structure.

### Constraints and non-goals
- Do not manually duplicate every bundled package's external dependencies in `packages/supi/package.json`.
- Do not change standalone package manifests unless the investigation shows they are incorrect.
- Do not alter Pi-facing package entrypoints or extension wiring.

### Verification intent
- Confirm the packed meta-package tarball or a fresh install from that tarball resolves required external dependencies for bundled sub-packages.
- Run targeted packaging tests covering the regression.
