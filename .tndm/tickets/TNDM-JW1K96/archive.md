# Archive

## Verification evidence

All tasks complete, all verification re-run fresh.

### Tasks 1-2 — supi-lsp policy + implementation
- `pnpm vitest run packages/supi-lsp/__tests__/unit/config.test.ts packages/supi-lsp/__tests__/unit/runtime-controller.test.ts --reporter=verbose`
- **Result: 38/38 passed** (exit 0)
- New tests pass: config: lsp.enabled non-impact, per-language disable, project re-enable override; runtime-controller: no disabled state with lsp.enabled, lsp.active ignored, per-language disable respected, deprecated keys exposed

### Tasks 3-4 — code-intelligence warnings + settings UI
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-command.test.ts packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-overlay.test.ts packages/supi-code-intelligence/__tests__/unit/lsp-settings.test.ts packages/supi-code-intelligence/__tests__/unit/lsp-coverage-warnings.test.ts --reporter=verbose`
- **Result: 66/66 passed** (exit 0)
- New tests pass: coverage warnings evaluator (deprecated-key, language-disabled, missing-server, structural-unavailable, empty-healthy), CoverageWarningState (grace period, dedup), settings UI (Disabled Servers replaces old controls), health/status surfaces show degraded coverage

### Task 5 — docs
- `rg` confirmed no remaining guidance for `lsp.enabled` / `lsp.active` as active switches; all references describe deprecation and per-language disable

### Task 6 — final verification
- `pnpm exec tsc -b packages/supi-lsp/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json` — **No errors** (exit 0)
- `pnpm exec biome check <all changed source files>` — **clean except 1 pre-existing warning** (exit 0)
- All targeted tests re-run fresh and pass
