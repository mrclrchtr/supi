## 1. Context Provider Registry (supi-core)

- [ ] 1.1 Create `packages/supi-core/context-provider-registry.ts` with `registerContextProvider()`, `getRegisteredContextProviders()`, and `clearRegisteredContextProviders()` using `globalThis` + `Symbol.for` pattern
- [ ] 1.2 Export the new module from `packages/supi-core/index.ts`
- [ ] 1.3 Add unit tests for the context-provider registry

## 2. Package Setup (supi-rtk)

- [ ] 2.1 Create `packages/supi-rtk/package.json` with peer dependencies on `@mariozechner/pi-coding-agent` and `@mrclrchtr/supi-core`
- [ ] 2.2 Create `packages/supi-rtk/tsconfig.json` and `packages/supi-rtk/__tests__/tsconfig.json`
- [ ] 2.3 Run `pnpm install` to update the lockfile

## 3. Core Implementation (supi-rtk)

- [ ] 3.1 Create `packages/supi-rtk/rewrite.ts` — `rtkRewrite(command, timeoutMs): string | undefined` wrapping `execFileSync("rtk", ["rewrite", command])`
- [ ] 3.2 Create `packages/supi-rtk/tracking.ts` — in-memory per-session savings tracker with rewrite count, fallback count, and command history
- [ ] 3.3 Create `packages/supi-rtk/index.ts` — extension entry point: verify rtk binary, register replacement bash tool with `createBashTool` + `spawnHook`, hook `user_bash`, register settings, register context provider, reset tracking on `session_start`
- [ ] 3.4 Add unit tests for `rewrite.ts` (mock `execFileSync`)
- [ ] 3.5 Add unit tests for `tracking.ts`
- [ ] 3.6 Add integration tests for the extension (mock pi, verify bash tool registration, spawnHook behavior, user_bash handling)

## 4. Supi-Context Integration

- [ ] 4.1 Update `packages/supi-context/analysis.ts` to call `getRegisteredContextProviders()` and include provider data in `ContextAnalysis`
- [ ] 4.2 Update `packages/supi-context/format.ts` to render context provider sections when data is available
- [ ] 4.3 Add tests for the context provider rendering in supi-context

## 5. Meta-Package Wiring

- [ ] 5.1 Create `packages/supi/rtk.ts` with explicit import/export default pattern
- [ ] 5.2 Add `@mrclrchtr/supi-rtk` dependency and extension entry to `packages/supi/package.json`
- [ ] 5.3 Add `./packages/supi-rtk/index.ts` to root `package.json` `pi.extensions`
- [ ] 5.4 Run `pnpm install` to update the lockfile

## 6. Verification

- [ ] 6.1 Run `pnpm typecheck` across the workspace
- [ ] 6.2 Run `pnpm test` across the workspace
- [ ] 6.3 Run `pnpm exec biome check` on all changed packages
