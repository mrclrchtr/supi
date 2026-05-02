## 1. Runtime behavior

- [ ] 1.1 Remove active root refresh emission from `packages/supi-claude-md/index.ts` `before_agent_start` while preserving first-start native context path capture.
- [ ] 1.2 Remove or make inert root refresh helpers in `packages/supi-claude-md/refresh.ts` so native `systemPromptOptions.contextFiles` contents are never returned for re-injection.
- [ ] 1.3 Keep context pruning/restore behavior safe for historical `supi-claude-md-refresh` messages so stale `details.promptContent` is not restored into model context.
- [ ] 1.4 Ensure `session_compact` does not force or imply root/native context refresh and only preserves behavior still needed for subdirectory injection.
- [ ] 1.5 Re-scope `rereadInterval` usage to subdirectory re-injection only, including `rereadInterval: 0` disabling repeat subdirectory reads but not first-time discovery.

## 2. Settings and documentation

- [ ] 2.1 Update Claude-MD settings registration labels/descriptions so `rereadInterval` describes subdirectory re-read rather than root refresh.
- [ ] 2.2 Update `packages/supi-claude-md/README.md` to remove root refresh as a capability and document `/reload` for root instruction file changes.
- [ ] 2.3 Update `packages/supi-claude-md/resources/supi-claude-md-guide/SKILL.md` to describe native root files as system-prompt-owned and not re-ingested by SuPi.
- [ ] 2.4 Update package-local guidance files that mention root refresh so future agents do not reintroduce the behavior.

## 3. Tests

- [ ] 3.1 Update refresh unit tests so native context file readers return no refresh payload for home, project-root, and native subdirectory files.
- [ ] 3.2 Update extension `before_agent_start` tests to assert no `supi-claude-md-refresh` message is emitted at turn 0, at `rereadInterval`, after high/low context usage, or after compaction.
- [ ] 3.3 Update lifecycle/state tests to remove root refresh token expectations that are no longer required, while keeping stale historical refresh messages pruned.
- [ ] 3.4 Update renderer tests to remove the required `supi-claude-md-refresh` renderer behavior or mark any retained renderer as compatibility-only.
- [ ] 3.5 Keep subdirectory discovery/re-injection tests passing, including threshold gating for already-injected directories and first-time injection under context pressure.

## 4. Verification

- [ ] 4.1 Run `pnpm exec biome check --write packages/supi-claude-md openspec/changes/remove-root-context-refresh` and review changes.
- [ ] 4.2 Run `pnpm exec tsc --noEmit -p packages/supi-claude-md/tsconfig.json`.
- [ ] 4.3 Run `pnpm exec tsc --noEmit -p packages/supi-claude-md/__tests__/tsconfig.json`.
- [ ] 4.4 Run `pnpm vitest run packages/supi-claude-md/`.
- [ ] 4.5 Run `openspec validate remove-root-context-refresh --strict`.
