# Archive

## Verification Results

### Fresh test run (2026-05-17)
- **Test files**: 10 passed (10)
- **Individual tests**: 84 passed (84)
- **TypeScript**: `tsc --noEmit -p packages/supi-review/tsconfig.json` — clean
- **Biome**: `biome check packages/supi-review` — clean (0 errors)

### Task completions

**Task 1** — Domain model, profiles, prompt builders
- New types: ReviewMode, ReviewBrief, ReviewProfile in types.ts
- Three starter profiles: general, security, api-maintainability in profiles.ts
- Brief builders: buildDynamicBrief, buildStandardBrief, assembleReviewerPrompt in briefs.ts
- Tests: briefs.test.ts (11 tests), prompts.test.ts additions (3 tests)

**Task 2** — Brief-driven orchestration
- New UI functions: selectReviewMode, selectProfile, collectDynamicInputs, approveBriefViaEditor
- Rewritten handleInteractive flow: mode → target → brief → approval → execution
- Tests: review-command.test.ts (8 tests), updated index.test.ts

**Task 3** — Brief through runner and result
- Added brief to ReviewerInvocation and attached via cleanup() to all ReviewResult variants
- Tests: runner.test.ts additions (2 brief-preservation tests), system-prompt.test.ts (regression)

**Task 4** — Connected output rendering
- format-content.ts shows brief context (mode, summary, intent, focus) before verdict
- renderer.ts shows brief context in TUI before findings
- Tests: renderer.test.ts additions (2 brief-context tests), index.test.ts additions (2 format tests)

**Task 5** — Documentation and verification
- README.md: updated workflow, architecture, module map
- CLAUDE.md: detailed architecture notes and module description table
- Full package verification: vitest + tsc + biome

### Relevant commit
66b495f feat(supi-review): redesign around brief-driven review pipeline
