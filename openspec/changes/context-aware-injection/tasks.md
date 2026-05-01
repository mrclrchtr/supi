## 1. Config & Settings

- [ ] 1.1 Add `contextThreshold` field to `ClaudeMdConfig` interface in `config.ts` with default value `80`
- [ ] 1.2 Add `contextThreshold` to the settings registration in `settings-registration.ts` (percentage values 0–100 in steps of 5)

## 2. Pure Function Logic

- [ ] 2.1 Add `contextUsage` optional parameter to `shouldRefreshRoot()` in `refresh.ts` — return `false` when `percent >= contextThreshold`, allow injection when `percent` is `null` or `undefined`
- [ ] 2.2 Add `contextUsage` optional parameter to `shouldInjectSubdir()` in `subdirectory.ts` — only gate re-injections (already-seen dirs); first-time discoveries always proceed
- [ ] 3. Unit Tests

- [ ] 3.1 Add tests for `shouldRefreshRoot()` with context threshold: below/above/at threshold, null percent, undefined usage, threshold=100 disabled
- [ ] 3.2 Add tests for `shouldInjectSubdir()` with context threshold: first-time dirs always inject, re-injections skipped above threshold, re-injections proceed below threshold

## 4. Integration Wiring

- [ ] 4.1 In `before_agent_start` handler (index.ts), call `ctx.getContextUsage()` and pass result to `shouldRefreshRoot()`
- [ ] 4.2 In `tool_result` handler (index.ts), call `ctx.getContextUsage()` and pass result to `shouldInjectSubdir()` via `collectStaleDirs()`
- [ ] 4.3 Update `collectStaleDirs()` signature to accept and forward `contextUsage`

## 5. Existing Tests

- [ ] 5.1 Update lifecycle tests that mock `shouldRefreshRoot` / `shouldInjectSubdir` to include the new `contextUsage` parameter in call signatures