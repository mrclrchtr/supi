# Task 9: Full verification: typecheck, biome, vitest, and pack checks

Run the full verification pipeline to confirm everything works end-to-end.

### Steps
1. **Typecheck all packages:**
   ```bash
   tsc -b packages/*/tsconfig.json packages/*/__tests__/tsconfig.json
   ```
   Must pass with zero errors.

2. **Biome lint (CI mode):**
   ```bash
   pnpm biome:ai
   ```
   Must pass. If any import sorting issues, run `pnpm biome:fix` first.

3. **Full test suite:**
   ```bash
   pnpm test
   ```
   Must pass: 168 test files, 1667 tests, zero failures.

4. **Pack verify:**
   ```bash
   pnpm pack:verify
   ```
   Must pass. All 11 bundled packages verify OK.

5. **Measure import phase improvement:**
   ```bash
   pnpm vitest --experimental.importDurations.print
   ```
   Confirm import phase wall time dropped from 70s baseline. Record new timing.

6. **Final `pnpm verify`:**
   ```bash
   pnpm verify
   ```
   Full pipeline must succeed.

### Verification
- All steps above produce zero errors and zero test failures
- Import phase timing recorded and compared to baseline
