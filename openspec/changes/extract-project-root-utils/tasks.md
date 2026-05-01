## 1. Move utilities into supi-core

- [ ] 1.1 Create `packages/supi-core/project-roots.ts` with shared project/root helper implementations moved from `supi-lsp`
- [ ] 1.2 Include `walkProject`, `findProjectRoot`, `dedupeTopmostRoots`, `sortRootsBySpecificity`, `buildKnownRootsMap`, `mergeKnownRoots`, `resolveKnownRoot`, `isWithin`, `isWithinOrEqual`, `byPathDepth`, and `segmentCount` where applicable
- [ ] 1.3 Export the shared helpers from `packages/supi-core/index.ts`
- [ ] 1.4 Ensure `project-roots.ts` has no imports from `supi-lsp` or other higher-level packages

## 2. Update supi-lsp consumers

- [ ] 2.1 Update `packages/supi-lsp/scanner.ts` to import `walkProject`, `dedupeTopmostRoots`, and related path helpers from `supi-core`
- [ ] 2.2 Update `packages/supi-lsp/utils.ts` to import `findProjectRoot` from `supi-core`
- [ ] 2.3 Update `packages/supi-lsp/manager-roots.ts` to import known-root helpers from `supi-core`
- [ ] 2.4 Remove now-unused local implementations from `supi-lsp`

## 3. Tests and verification

- [ ] 3.1 Add or move unit tests covering `supi-core` project/root helper behavior
- [ ] 3.2 Keep or update `supi-lsp` scanner/root tests to verify integration behavior is unchanged
- [ ] 3.3 Run `pnpm exec biome check --write packages/supi-core packages/supi-lsp`
- [ ] 3.4 Run `pnpm typecheck`
- [ ] 3.5 Run `pnpm test -- packages/supi-lsp` or the closest package-scoped test command available
- [ ] 3.6 Run `pnpm verify`
