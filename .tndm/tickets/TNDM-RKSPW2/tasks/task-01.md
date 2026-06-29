# Task 1: Add executeSectionMode() for include-without-task path

In `src/use-case/generate-context.ts`:
- Add `executeSectionMode()` that builds compact module header + iterates `input.include` via `buildRequestedSection()`
- Modify `executeContext()` to branch to section mode when `include` is set but `task` is missing
- Sections without target return honest unavailable messages per existing pattern
