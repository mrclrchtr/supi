## 1. Package Scaffolding

- [ ] 1.1 Create `packages/supi-context/package.json` with `@mrclrchtr/supi-context` name, pi-package manifest (`pi.extensions: ["./index.ts"]`), peer deps on `@mariozechner/pi-coding-agent` and `@mariozechner/pi-tui`, workspace dep on `@mrclrchtr/supi-core`
- [ ] 1.2 Create `packages/supi-context/tsconfig.json` extending root tsconfig
- [ ] 1.3 Create `packages/supi-context/utils.ts` with `formatTokens` helper (e.g., `45231` → `"45.2k"`) and `pluralize` helper
- [ ] 1.4 Run `pnpm install` to wire the new workspace package

## 2. Token Analysis

- [ ] 2.1 Create `packages/supi-context/analysis.ts` with `ContextAnalysis` interface and `analyzeContext()` function that:
  - Builds the API view via `buildSessionContext(entries)`
  - Walks API-view messages, calling `estimateTokens()` per message and bucketing into categories (user, assistant, toolCall, toolResult)
  - Computes scale factor from `ctx.getContextUsage().tokens` and applies it to all categories
  - Extracts system prompt sub-categories from cached `systemPromptOptions` (contextFiles, skills, guidelines, customPrompt)
  - Detects compaction via `getLatestCompactionEntry()`
  - Returns a structured `ContextAnalysis` object with all category token counts
- [ ] 2.2 Add `extractInjectedContextFiles()` function that scans tool result messages for `<extension-context source="supi-claude-md" file="..." turn="...">` regex and returns list of `{ file, turn, content }` with token estimates
- [ ] 2.3 Add `getAutocompactBuffer()` function that reads compaction `reserveTokens` from pi settings (default 16384)

## 3. Output Formatting

- [ ] 3.1 Create `packages/supi-context/format.ts` with `formatContextReport()` that takes `ContextAnalysis` + theme and returns styled string lines for the report
- [ ] 3.2 Implement visual block grid (20×5) with category-colored filled blocks and empty blocks, model info on the right side
- [ ] 3.3 Implement category breakdown section with token counts and percentages (including autocompact buffer and free space)
- [ ] 3.4 Implement context files section (system prompt) — omit when empty
- [ ] 3.5 Implement injected context files section (supi-claude-md) with turn annotations — omit when empty
- [ ] 3.6 Implement skills section listing all loaded skills with per-skill token estimates
- [ ] 3.7 Implement guidelines and tool definitions summary lines
- [ ] 3.8 Implement compaction note when applicable

## 4. Extension Entry and Renderer

- [ ] 4.1 Create `packages/supi-context/index.ts` with extension factory that:
  - Maintains `systemPromptOptions` cache in extension state
  - Registers `before_agent_start` handler to cache `event.systemPromptOptions`
  - Registers `session_start` handler to clear cache
  - Registers `/supi-context` command that collects data, runs analysis, and sends custom message
- [ ] 4.2 Create `packages/supi-context/renderer.ts` with `MessageRenderer` for `"supi-context"` custom type that renders the formatted report with theme-aware colors
- [ ] 4.3 Register the renderer in the extension factory

## 5. Meta-Package Integration

- [ ] 5.1 Create `packages/supi/context.ts` with `export { default } from "@mrclrchtr/supi-context"`
- [ ] 5.2 Update `packages/supi/package.json`: add `@mrclrchtr/supi-context: "workspace:*"` to dependencies, add `"./context.ts"` to `pi.extensions`

## 6. Tests

- [ ] 6.1 Create `packages/supi-context/__tests__/tsconfig.json`
- [ ] 6.2 Create `packages/supi-context/__tests__/analysis.test.ts` testing: API-view construction, per-category estimation, scaling logic, compaction detection, edge cases (null tokens, empty branch)
- [ ] 6.3 Create `packages/supi-context/__tests__/format.test.ts` testing: grid rendering, category breakdown formatting, conditional section omission (no injected files → no section, no context files → no section), skills always shown
- [ ] 6.4 Create `packages/supi-context/__tests__/utils.test.ts` testing `formatTokens` helper

## 7. Verification

- [ ] 7.1 Run `pnpm exec tsc --noEmit -p packages/supi-context/tsconfig.json` — typecheck passes
- [ ] 7.2 Run `pnpm exec tsc --noEmit -p packages/supi-context/__tests__/tsconfig.json` — test typecheck passes
- [ ] 7.3 Run `pnpm vitest run packages/supi-context/` — all tests pass
- [ ] 7.4 Run `pnpm exec biome check packages/supi-context/` — lint passes
- [ ] 7.5 Run `pnpm typecheck` — full workspace typecheck passes
- [ ] 7.6 Run `pnpm test` — full test suite passes
