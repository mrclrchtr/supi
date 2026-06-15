# Task 7: Final verification — full test suite + smoke test without API key

## Goal

Confirm the entire change works end-to-end: tests pass, typecheck passes, lint passes, and the extension loads without CONTEXT7_API_KEY.

## Verification steps

1. **Full typecheck:**
   ```
   pnpm exec tsc -b packages/supi-web/tsconfig.json packages/supi-web/__tests__/tsconfig.json
   ```
   Expect: clean exit, no errors.

2. **Lint:**
   ```
   pnpm exec biome check packages/supi-web/
   ```
   Expect: no errors (warnings ok).

3. **Full test suite:**
   ```
   pnpm vitest run packages/supi-web/
   ```
   Expect: all tests pass.

4. **Smoke test — module loads without API key:**
   Unset `CONTEXT7_API_KEY` and import the module:
   ```
   CONTEXT7_API_KEY= pnpm exec jiti -e '
     import docsExtension from "./packages/supi-web/src/docs.ts";
     console.log("Module loaded OK");
   '
   ```
   Expect: prints "Module loaded OK" — no crash, no "API key is required" error.

5. **Full workspace verify:**
   ```
   pnpm verify:ai
   ```
   Expect: clean pass (typecheck + lint + tests across all packages).
