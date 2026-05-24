# Task 3: Edit improver SKILL.md to reflect stricter non-obvious-only guidance

### Changes

**Phase 1 baseline — Low risk category:**
- "Commands and workflows" → "Non-obvious commands and workflows (not routine build/test/lint)"

**Phase 3 quality checklist:**
- "Commands/workflows documented | High | Are build/test/deploy commands present?" → "Non-obvious commands & workflows | High | Are gotcha commands or non-obvious workflow patterns captured?"

**Phase 5 update guidelines (item 1):**
- "Commands or workflows discovered during analysis" → "Non-obvious commands or workflows discovered during analysis"

**Phase 5 diff example:**
- Replace "Build command was missing" with a non-obvious example

**Common Issues to Flag:**
- Reframe "Stale commands" and "Broken test commands" — move focus away from routine command staleness; note that routine commands are in package.json anyway

**What Makes a Great CLAUDE.md:**
- "Commands (build, test, dev, lint)" → "Non-obvious commands & workflows (gotcha flags, ordering, hooks)"
- "Testing (commands, patterns)" → "Testing (non-obvious patterns and conventions)"
