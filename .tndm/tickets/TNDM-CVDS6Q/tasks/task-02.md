# Task 2: Sync reference files from improver/ to revision/ — verify byte-identical

Copy the edited improver reference files to revision/ so they stay byte-identical.

```bash
cp packages/supi-claude-md/skills/claude-md-improver/references/quality-criteria.md packages/supi-claude-md/skills/claude-md-revision/references/quality-criteria.md
cp packages/supi-claude-md/skills/claude-md-improver/references/templates.md packages/supi-claude-md/skills/claude-md-revision/references/templates.md
cp packages/supi-claude-md/skills/claude-md-improver/references/update-guidelines.md packages/supi-claude-md/skills/claude-md-revision/references/update-guidelines.md
```

Run the sync test to confirm identity.
