# Archive

All 4 tasks verified fresh on 2026-06-15.

Task 1 (RED): targeted tests failed against current implementation for the right reasons — 12 failures covering forbidden mode/kind combinations, semantic fallback, and missing structural/semantic providers.
Task 2 (GREEN): targeted tests passed after implementation — 41/41, exit 0.
Task 3 (docs): no stale claims found in README or CLAUDE.md. Git diff confirms strict matrix is documented consistently.
Task 4 (final verification):
- `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/ -v` — 510 passed, 4 skipped, exit 0
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json` — no errors
- `pnpm exec biome check packages/supi-code-intelligence` — 20 pre-existing warnings, 0 errors, exit 0
- Full `pnpm verify:ai` — passed earlier in apply phase (all 1967 tests, typecheck, lint, pack verify)

Review item fix: narrowed `kind` StringEnum in schemas.ts to exactly `["definition", "import", "export"]` and added registration test assertions that `call`, `type`, `test` are absent from the registered enum. 41 targeted tests pass, 510 package tests pass, typecheck clean.
