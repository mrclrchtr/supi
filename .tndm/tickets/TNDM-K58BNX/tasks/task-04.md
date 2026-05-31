# Task 4: Final verification: package checks and PI smoke test for the new inspect flow

# Goal
Prove the whole package works end-to-end after the tool-surface split.

# Files
- No new source files; this task verifies the assembled change across the package.

# Change
1. Run the full package-scoped automated checks.
2. Perform a manual PI smoke test that exercises the new public behavior.

# Verification
Run all automated checks:

```bash
RTK_DISABLED=1 pnpm vitest run -v packages/supi-code-intelligence/
RTK_DISABLED=1 pnpm exec tsc -b \
  packages/supi-code-intelligence/tsconfig.json \
  packages/supi-code-intelligence/__tests__/tsconfig.json
RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence --max-diagnostics=20
```

Then perform this PI smoke test in the repo root:
1. Call `code_health({ scope: "packages/supi-code-intelligence", refresh: true, include: ["diagnostics", "servers"] })` and confirm providers are reported honestly.
2. Call `code_inspect({ file: "packages/supi-code-intelligence/src/tool/register-tools.ts", line: 9, character: 17 })` and confirm the result is a point inspection with best-effort sections such as node/enclosing symbol and, when available, hover/definition/code actions/nearby diagnostics.
3. Call `code_resolve({ query: "registerCodeIntelligenceTools", scope: "packages/supi-code-intelligence/src", kind: "function" })`, capture the returned `targetId`, then call `code_brief({ targetId: "<returned-id>" })` and confirm the result is orientation-only rather than inspect-style output.
4. Confirm anchored `code_brief` is no longer a public contract by inspecting the registered schema in `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` expectations and by ensuring no public docs advertise `line`/`character` on `code_brief`.

Expected result: all commands pass, `code_inspect` works at a concrete position, and `code_brief` remains useful without exposing hidden point inspection.

# Test mode
Verification/integration gate.
