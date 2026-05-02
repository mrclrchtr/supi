## 1. Runtime behavior

- [x] 1.1 Remove active root refresh emission from `packages/supi-claude-md/index.ts` `before_agent_start` while preserving first-start native context path capture.
- [x] 1.2 Remove or make inert root refresh helpers in `packages/supi-claude-md/refresh.ts` so native `systemPromptOptions.contextFiles` contents are never returned for re-injection.
- [x] 1.3 Keep context pruning/restore behavior safe for historical `supi-claude-md-refresh` messages so stale `details.promptContent` is not restored into model context.
- [x] 1.4 Ensure `session_compact` does not force or imply root/native context refresh and only preserves behavior still needed for subdirectory injection.
- [x] 1.5 Re-scope `rereadInterval` usage to subdirectory re-injection only, including `rereadInterval: 0` disabling repeat subdirectory reads but not first-time discovery.

## 2. Settings and documentation

- [x] 2.1 Update Claude-MD settings registration labels/descriptions so `rereadInterval` describes subdirectory re-read rather than root refresh.
- [x] 2.2 Update `packages/supi-claude-md/README.md` to remove root refresh as a capability and document `/reload` for root instruction file changes.
- [x] 2.3 Update `packages/supi-claude-md/resources/supi-claude-md-guide/SKILL.md` to describe native root files as system-prompt-owned and not re-ingested by SuPi.
- [x] 2.4 Update package-local guidance files that mention root refresh so future agents do not reintroduce the behavior.

## 3. Tests

- [x] 3.1 Update refresh unit tests so native context file readers return no refresh payload for home, project-root, and native subdirectory files.
- [x] 3.2 Update extension `before_agent_start` tests to assert no `supi-claude-md-refresh` message is emitted at turn 0, at `rereadInterval`, after high/low context usage, or after compaction.
- [x] 3.3 Update lifecycle/state tests to remove root refresh token expectations that are no longer required, while keeping stale historical refresh messages pruned.
- [x] 3.4 Update renderer tests to remove the required `supi-claude-md-refresh` renderer behavior or mark any retained renderer as compatibility-only.
- [x] 3.5 Keep subdirectory discovery/re-injection tests passing, including threshold gating for already-injected directories and first-time injection under context pressure.

## 4. Verification

- [x] 4.1 Run `pnpm exec biome check --write packages/supi-claude-md openspec/changes/remove-root-context-refresh` and review changes.
- [x] 4.2 Run `pnpm exec tsc --noEmit -p packages/supi-claude-md/tsconfig.json`.
- [x] 4.3 Run `pnpm exec tsc --noEmit -p packages/supi-claude-md/__tests__/tsconfig.json`.
- [x] 4.4 Run `pnpm vitest run packages/supi-claude-md/`.
- [x] 4.5 Run `openspec validate remove-root-context-refresh --strict`.
