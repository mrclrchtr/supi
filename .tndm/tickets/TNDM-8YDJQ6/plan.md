## Implementation Plan: Centralize test-data factory helpers in supi-test-utils

### Background
Every workspace package currently defines its own local `createPiMock`, `makeCtx`, `createMockPi`, or `createCtxMock`. This causes type drift and makes `ExtensionAPI` / `ExtensionCommandContext` migrations painful. The existing `@mrclrchtr/supi-test-utils` package is not used by any consumer.

### Goal
Move generic pi-mock and context-mock factories into `supi-test-utils` so all packages share one source of truth. Package-specific helpers (e.g. `assistantMessage`, `makeRichFixture`, `createTempProjectDir`) stay local.

### Key design decision
The shared `createPiMock()` returns a **flat** object that is both the `ExtensionAPI` mock and exposes captured `handlers`/`commands`/`tools`/`renderers`/`entries` directly. Tests that currently destructure a nested `.pi` wrapper (e.g. `supi-claude-md`, `supi-debug`) will be updated to use the flat shape (`pi.handlers.get(...)`).

---

- [x] **Task 1**: Enrich `supi-test-utils` with comprehensive factories
  - File: `packages/supi-test-utils/src/pi-mock.ts`
  - Additions to `createPiMock()`:
    - `sendMessage` → captured `messages` array
    - `events` EventBus with `on`/`emit` (used by `supi-extras/tab-spinner`)
    - `getActiveTools` / `setActiveTools` (used by `supi-lsp`, `supi-context`)
    - `getSessionName` (used by `supi-extras/tab-spinner`)
    - `registerShortcut` (used by `supi-extras/copy-prompt`, `prompt-stash`)
    - `exec` (used by `supi-extras/prompt-stash`)
    - `getHandlers(event)` convenience accessor
  - Additions to `makeCtx()`:
    - `ui.theme` with `fg`, `bg`, `bold`
    - `ui.notify`, `ui.setStatus`, `ui.setTitle`, `ui.setWidget`, `ui.removeWidget`
    - `ui.getEditorText`, `ui.setEditorText`, `ui.input`, `ui.custom`
    - `sessionManager.getBranch`
    - `getContextUsage`, `getSystemPrompt`, `model`
    - All defaults remain overridable via the existing `overrides` spread
  - Update `PiMock` type to match new surface
  - File: `packages/supi-test-utils/src/index.ts`
    - Re-export new symbols if any are added
  - Verification: `pnpm exec tsc --noEmit -p packages/supi-test-utils/tsconfig.json`

- [x] **Task 2**: Add `supi-test-utils` as workspace devDependency to all consuming packages
  - Files: `packages/*/package.json` for the following packages:
    - `supi-bash-timeout`, `supi-cache`, `supi-claude-md`, `supi-code-intelligence`, `supi-context`, `supi-debug`, `supi-extras`, `supi-lsp`, `supi-rtk`, `supi-tree-sitter`
  - Add `"@mrclrchtr/supi-test-utils": "workspace:*"` to each `devDependencies`
  - Verification: `pnpm install --no-frozen-lockfile` succeeds

- [x] **Task 3**: Migrate `supi-bash-timeout` tests
  - File: `packages/supi-bash-timeout/__tests__/extension.test.ts`
  - Delete local `createPiMock()` and `createCtxMock()`
  - Import `createPiMock, makeCtx` from `@mrclrchtr/supi-test-utils`
  - Update assertions to use `pi.getHandlers("tool_call")` or `pi.handlers.get("tool_call")`
  - Verification: `pnpm vitest run packages/supi-bash-timeout/`

- [x] **Task 4**: Migrate `supi-claude-md` tests
  - File: `packages/supi-claude-md/__tests__/extension-helpers.ts`
  - Delete local `createPiMock()` and `makeCtx()`; keep `DEFAULT_CONFIG`
  - Files: `packages/supi-claude-md/__tests__/extension-lifecycle.test.ts`, `extension-toolresult.test.ts`
  - Replace `import { createPiMock, makeCtx } from "./extension-helpers.ts"` with `@mrclrchtr/supi-test-utils`
  - Adapt destructuring: change `const { handlers, pi } = createPiMock()` → `const pi = createPiMock()` and use `pi.handlers.get(...)` / `pi.on(...)` directly
  - Verification: `pnpm vitest run packages/supi-claude-md/`

- [x] **Task 5**: Migrate `supi-context` tests
  - Files: `packages/supi-context/__tests__/analysis.test.ts`, `analysis-edge.test.ts`
  - Delete local `createMockCtx()` and `createMockPi()`
  - Import `createPiMock, makeCtx` from `@mrclrchtr/supi-test-utils`
  - Keep `createMockMessage()` local (package-specific)
  - Verification: `pnpm vitest run packages/supi-context/`

- [x] **Task 6**: Migrate `supi-debug` tests
  - File: `packages/supi-debug/__tests__/index.test.ts`
  - Delete local `createPiMock()`
  - Import `createPiMock` from `@mrclrchtr/supi-test-utils`
  - Adapt test code: shared mock is flat (no nested `.pi` wrapper)
  - Keep `packages/supi-debug/__tests__/renderer.test.ts` unchanged — its `createMockPi()` is renderer-only and has a different shape
  - Verification: `pnpm vitest run packages/supi-debug/`

- [x] **Task 7**: Migrate `supi-extras` tests
  - Files: `packages/supi-extras/__tests__/tab-spinner.test.ts`, `copy-prompt.test.ts`, `prompt-stash.test.ts`, `git-editor.test.ts`
  - Delete local `createPiMock()` and `createCtxMock()` definitions
  - Import from `@mrclrchtr/supi-test-utils`
  - For `tab-spinner.test.ts`: pass `sessionName` via overrides or a new `createPiMock({ sessionName })` option if needed
  - For `copy-prompt.test.ts` / `prompt-stash.test.ts`: use `makeCtx()` with `ui.getEditorText` override
  - Verification: `pnpm vitest run packages/supi-extras/`

- [ ] **Task 8**: Migrate `supi-lsp` e2e smoke test
  - File: `packages/supi-lsp/__tests__/e2e-smoke.test.ts`
  - Delete local `createPiMock()`
  - Import from `@mrclrchtr/supi-test-utils`
  - Keep `createSessionCtx()` and `createTempProjectDir()` local (e2e-specific)
  - Verification: `pnpm vitest run packages/supi-lsp/__tests__/e2e-smoke.test.ts`

- [x] **Task 9**: Migrate `supi-rtk` tests
  - File: `packages/supi-rtk/__tests__/extension.test.ts`
  - Delete local `createPiMock()`
  - Import from `@mrclrchtr/supi-test-utils`
  - Verification: `pnpm vitest run packages/supi-rtk/`

- [x] **Task 10**: Migrate `supi-tree-sitter` tests
  - File: `packages/supi-tree-sitter/__tests__/tool.test.ts`
  - Delete local `createPiMock()`
  - Import from `@mrclrchtr/supi-test-utils`
  - Keep `executeTool()`, `startSession()`, `setupWithSession()` local
  - Verification: `pnpm vitest run packages/supi-tree-sitter/`

- [x] **Task 11**: Migrate `supi-code-intelligence` tests
  - File: `packages/supi-code-intelligence/__tests__/integration.test.ts`
  - Delete local `createPiMock()`
  - Import from `@mrclrchtr/supi-test-utils`
  - Verification: `pnpm vitest run packages/supi-code-intelligence/`

- [x] **Task 12**: Migrate `supi-cache` tests
  - File: `packages/supi-cache/__tests__/monitor/monitor.test.ts`
  - Delete local `createPiMock()` and `makeCtx()`
  - Import from `@mrclrchtr/supi-test-utils`
  - Keep local `assistantMessage()`, `resetMocks()`, `getHandler()` (package-specific)
  - Verification: `pnpm vitest run packages/supi-cache/`

- [x] **Task 13**: Full workspace regression verification
  - Run `pnpm vitest run` for the full suite
  - Run `pnpm exec biome check packages/supi-test-utils` on the updated shared package
  - Run `pnpm typecheck` or equivalent to ensure no TypeScript errors in migrated test files
  - Verification: All tests pass, no biome errors, no tsc errors
