# Fix npm peer dependency resolution for pi install

Root cause: `pi install npm:@mrclrchtr/supi` fails because npm 7+ auto-installs peer deps (@earendil-works/pi-tui, @earendil-works/pi-ai, typebox) which are already provided by the pi runtime. pi-tui pulls in koffi as a native dependency whose install script fails on Node.js 24.

Fix: Mark pi-provided peer deps as optional via peerDependenciesMeta in each sub-package's package.json.

- [x] **Task 1**: Add peerDependenciesMeta marking pi-provided deps as optional in all sub-packages
  - Files: packages/supi-core/package.json, packages/supi-ask-user/package.json, packages/supi-bash-timeout/package.json, packages/supi-claude-md/package.json, packages/supi-context/package.json, packages/supi-debug/package.json, packages/supi-extras/package.json, packages/supi-lsp/package.json, packages/supi-tree-sitter/package.json, packages/supi-code-intelligence/package.json, packages/supi-cache/package.json, packages/supi-review/package.json, packages/supi-rtk/package.json, packages/supi-insights/package.json, packages/supi-web/package.json, packages/supi-test-utils/package.json
  - Verification: `pnpm exec biome check packages/*/package.json`

- [x] **Task 2**: Verify global npm install works without --legacy-peer-deps
  - File: N/A (runtime test)
  - Verification: `npm install -g @mrclrchtr/supi --dry-run 2>&1` — confirm no koffi/pi-tui/pi-ai/typebox in the dependency tree

- [x] **Task 3**: Run workspace typecheck and tests
  - Verification: `pnpm typecheck && pnpm test`
