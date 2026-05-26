# Archive

## Verification evidence

### Code-level checks
- `supi-lsp/package.json`: no `pi.extensions`, no `./extension` export, library-only ✅
- `supi-tree-sitter/package.json`: no `pi.extensions`, no `./extension` export, library-only ✅
- `supi-code-intelligence/package.json`: sole `pi.extensions: ["./src/extension.ts"]`, bundles both substrates in `bundledDependencies` ✅
- Root `package.json`: only `supi-code-intelligence` in `pi.extensions`, no `supi-lsp` or `supi-tree-sitter` entries ✅
- `supi-lsp/src/extension.ts`: does not exist ✅
- `supi-tree-sitter/src/extension.ts`: does not exist ✅

### Adapter code re-homed
- `supi-code-intelligence/src/lsp/`: tool registration, guidance, session lifecycle, settings, message renderer, diagnostics injection ✅
- `supi-code-intelligence/src/tree-sitter/`: tool registration, guidance, session lifecycle ✅

### Test suites (all green)
- `supi-code-intelligence`: 231 passed, 2 skipped
- `supi-lsp`: 325 passed
- `supi-tree-sitter`: 155 passed
