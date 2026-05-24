# Task 4: Edit revision SKILL.md to reflect stricter non-obvious-only guidance

### Changes

**"What TO capture" — item 1:**
- "Commands/workflows discovered or used repeatedly" → "Non-obvious commands/workflows discovered or used repeatedly (not routine build/test/lint)"

**"What NOT to capture" — add new item:**
- "Routine/easy-to-find commands: `npm install`, `npm test`, `npm run build` — these are in package.json or README and don't earn their place in the context window"

**Diff format example (Step 3):**
- Replace `pnpm vitest run packages/<pkg>/` routine command with a non-obvious gotcha (e.g., "pre-push hook runs `pnpm verify` covering both lint and tests")

**Validation checklist:**
- "Commands are tested and work" → qualify to non-obvious commands only
