## 1. Context Provider Registry (supi-core)

- [x] 1.1 Create `packages/supi-core/context-provider-registry.ts` with `registerContextProvider()`, `getRegisteredContextProviders()`, and `clearRegisteredContextProviders()` using `globalThis` + `Symbol.for` pattern
- [x] 1.2 Export the new module from `packages/supi-core/index.ts`
- [x] 1.3 Add unit tests for the context-provider registry

## 2. Package Setup (supi-rtk)

- [x] 2.1 Create `packages/supi-rtk/package.json` with peer dependencies on `@mariozechner/pi-coding-agent` and `@mrclrchtr/supi-core`
- [x] 2.2 Create `packages/supi-rtk/tsconfig.json` and `packages/supi-rtk/__tests__/tsconfig.json`
- [x] 2.3 Run `pnpm install` to update the lockfile

## 3. Core Implementation (supi-rtk)

- [x] 3.1 Create `packages/supi-rtk/rewrite.ts` — `rtkRewrite(command, timeoutMs): string | undefined` wrapping `execFileSync("rtk", ["rewrite", command])`
- [x] 3.2 Create `packages/supi-rtk/tracking.ts` — in-memory per-session savings tracker with rewrite count, fallback count, and command history
- [x] 3.3 Create `packages/supi-rtk/index.ts` — extension entry point: verify rtk binary, register replacement bash tool with `createBashTool` + `spawnHook`, hook `user_bash`, register settings, register context provider, reset tracking on `session_start`
- [x] 3.4 Add unit tests for `rewrite.ts` (mock `execFileSync`)
- [x] 3.5 Add unit tests for `tracking.ts`
- [x] 3.6 Add integration tests for the extension (mock pi, verify bash tool registration, spawnHook behavior, user_bash handling)

## 4. Supi-Context Integration

- [x] 4.1 Update `packages/supi-context/analysis.ts` to call `getRegisteredContextProviders()` and include provider data in `ContextAnalysis`
- [x] 4.2 Update `packages/supi-context/format.ts` to render context provider sections when data is available
- [x] 4.3 Add tests for the context provider rendering in supi-context

## 5. Meta-Package Wiring

- [x] 5.1 Create `packages/supi/rtk.ts` with explicit import/export default pattern
- [x] 5.2 Add `@mrclrchtr/supi-rtk` dependency and extension entry to `packages/supi/package.json`
- [x] 5.3 Add `./packages/supi-rtk/index.ts` to root `package.json` `pi.extensions`
- [x] 5.4 Run `pnpm install` to update the lockfile

## 6. Verification

- [x] 6.1 Run `pnpm typecheck` across the workspace
- [x] 6.2 Run `pnpm test` across the workspace
- [x] 6.3 Run `pnpm exec biome check` on all changed packages
