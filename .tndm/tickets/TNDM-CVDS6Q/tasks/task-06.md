# Task 6: Full verification: sync test, biome, manual consistency review

Run the full verification chain:

```bash
# Reference files are byte-identical
pnpm vitest run packages/supi-claude-md/__tests__/unit/skill-references-sync.test.ts

# All skill files pass biome
pnpm exec biome check packages/supi-claude-md/skills/
pnpm exec biome check packages/supi-claude-md/skills/claude-md-revision/evals/evals.json
```

Manual consistency review checklist:
- Every mention of "commands" now distinguishes routine vs non-obvious
- No template still shows routine commands as recommended content
- Update guidelines no longer use routine commands as positive examples
- SKILL.md "what to capture" sections are qualified
- Evals expect gotcha content, not routine commands
