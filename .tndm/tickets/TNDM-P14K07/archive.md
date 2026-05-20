# Archive

Fresh archive verification for TNDM-P14K07:

- Task status check: `supi_tndm_cli task_list TNDM-P14K07` showed Tasks 1-4 all `done`.
- Intent/design check: reviewed `.tndm/tickets/TNDM-P14K07/content.md`; implemented result matches the approved direction: repo-wide package-layout convention, `supi-insights` package-level tests, and `supi-lsp` hybrid `config/` / `session/` / `tool/` / `ui/` layout with root public surfaces preserved.

Fresh verification commands run during archive:

1. `pnpm vitest run packages/supi-insights/ && pnpm exec tsc --noEmit -p packages/supi-insights/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-insights/__tests__/tsconfig.json && pnpm exec biome check packages/supi-insights/`
   - Result: passed
   - Evidence: 2 test files passed, 55 tests passed; source typecheck passed; test typecheck passed; Biome checked 20 files with no fixes applied.

2. `pnpm exec biome check packages/supi-lsp && pnpm vitest run packages/supi-lsp/ && pnpm exec tsc --noEmit -p packages/supi-lsp/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-lsp/__tests__/tsconfig.json`
   - Result: passed
   - Evidence: Biome checked 89 files with no fixes applied; 41 test files passed, 439 tests passed; source typecheck passed; test typecheck passed.

3. `rg -n "package layout|__tests__/unit|domain folders|supi-lsp|supi-insights" docs/package-layout.md README.md CLAUDE.md && rg -n "default for new packages|stay flat unless they grow|supi-bash-timeout|supi-web" docs/package-layout.md CLAUDE.md`
   - Result: passed
   - Evidence: matches found in `docs/package-layout.md`, `README.md`, and `CLAUDE.md` confirming the documented convention, standard test buckets, domain-folder guidance, anchor examples, default-adoption policy, and flat-package exceptions.

4. Layout/doc accuracy check:
   - `fd . packages/supi-insights/__tests__ -t f | sort`
   - `fd . packages/supi-lsp/src -t f | sort`
   - `fd . packages/supi-lsp/__tests__ -t f | sort`
   - Result: passed
   - Evidence: `packages/supi-insights/__tests__/unit/` exists with package-level test tsconfig; `packages/supi-lsp/src/` contains `config/`, `session/`, `tool/`, and `ui/`; `packages/supi-lsp/__tests__/` contains `helpers/`, `unit/`, and `integration/`, matching the updated docs.

Documentation reviewed against the final implementation:
- `docs/package-layout.md`
- `README.md`
- `CLAUDE.md`
- `packages/supi-insights/CLAUDE.md`
- `packages/supi-lsp/README.md`
- `packages/supi-lsp/CLAUDE.md`

Conclusion: all planned tasks are complete, fresh verification passed, and the living documentation matches the final code and test layout.
