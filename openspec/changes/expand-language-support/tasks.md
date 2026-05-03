## 1. Tree-sitter Grammar Infrastructure

- [ ] 1.1 Update `GrammarId` type in `packages/supi-tree-sitter/types.ts` to include `python`, `rust`, `go`, `c`, `cpp`, `java`, `kotlin`, `ruby`
- [ ] 1.2 Update `EXTENSION_GRAMMAR` map in `packages/supi-tree-sitter/language.ts` with new file extension mappings
- [ ] 1.3 Update `GRAMMAR_WASM` map in `packages/supi-tree-sitter/language.ts` with new grammar WASM filenames
- [ ] 1.4 Update `GRAMMAR_PACKAGE` map in `packages/supi-tree-sitter/language.ts` with new npm package names
- [ ] 1.5 Add 8 new `tree-sitter-*` packages as `peerDependencies` in `packages/supi-tree-sitter/package.json`

## 2. LSP Default Server Expansion

- [ ] 2.1 Add `ruby-lsp` server definition to `packages/supi-lsp/defaults.json`
- [ ] 2.2 Add `jdtls` server definition to `packages/supi-lsp/defaults.json`
- [ ] 2.3 Add `kotlin-lsp` server definition to `packages/supi-lsp/defaults.json`

## 3. LSP Config Unification (`.pi-lsp.json` → supi config)

- [ ] 3.1 Update `ServerConfig` and `LspConfig` types in `packages/supi-lsp/types.ts`: keys are language names (e.g., `typescript`, `python`), not server binary names
- [ ] 3.2 Rename `LspSettings.servers` (allowlist) to `LspSettings.active` in `types.ts` and `settings-registration.ts`
- [ ] 3.3 Update `loadConfig()` in `packages/supi-lsp/config.ts` to implement per-language-key merge against built-in defaults: read `lsp.servers` from supi config, merge each language key individually (omitted fields fall back to defaults)
- [ ] 3.4 Remove `.pi-lsp.json` reading logic from `loadConfig()` entirely
- [ ] 3.5 Update `settings-registration.ts` to ensure the `servers` key is not accidentally surfaced in the `/supi-settings` UI (it is JSON-only)
- [ ] 3.6 Add tests for per-key merge resolution and active allowlist behavior
- [ ] 3.7 Update `packages/supi-lsp/CLAUDE.md` with the new config location, language-keyed structure, and breaking change notice

## 4. Validation & Verification

- [ ] 4.1 Run `pnpm install` to resolve new peer dependencies and update lockfile
- [ ] 4.2 Run `pnpm exec biome check packages/supi-tree-sitter packages/supi-lsp packages/supi-core` and fix any issues
- [ ] 4.3 Run `pnpm exec tsc --noEmit -p packages/supi-tree-sitter/tsconfig.json` and fix type errors
- [ ] 4.4 Run `pnpm exec tsc --noEmit -p packages/supi-lsp/tsconfig.json` and fix type errors
- [ ] 4.5 Run `pnpm exec tsc --noEmit -p packages/supi-lsp/__tests__/tsconfig.json` and fix type errors
- [ ] 4.6 Run `pnpm vitest run packages/supi-tree-sitter/` and ensure tests pass
- [ ] 4.7 Run `pnpm vitest run packages/supi-lsp/` and ensure tests pass
- [ ] 4.8 Run `chezmoi diff` or equivalent sanity check if LSP defaults are symlinked/copied elsewhere

## 5. Documentation & Cleanup

- [ ] 5.1 Update `packages/supi-tree-sitter/CLAUDE.md` with the expanded supported language list
- [ ] 5.2 Update `packages/supi-lsp/CLAUDE.md` with the new default server entries and config location
- [ ] 5.3 Verify no stale `// biome-ignore` comments remain after changes
