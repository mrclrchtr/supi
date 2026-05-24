# Task 1: Edit all three reference files (improver copy): quality-criteria.md, templates.md, update-guidelines.md

### quality-criteria.md
- Rename Criterion 1: "Commands/Workflows" → "Non-Obvious Commands & Workflows"
- Rewrite scoring: reward gotcha-commands and non-obvious workflow patterns; penalize listing routine install/build/test/lint commands
- Remove "Build, test, lint, deploy commands present" from the 15-point tier description; replace with non-obvious command examples
- Update "What is NOT overlap": qualify "commands and workflows" → "non-obvious commands and workflows"

### templates.md
- Replace `## Commands` section template with `## Non-Obvious Commands & Workflows`, including a warning not to list routine npm install/test/build commands
- Drop Commands section from Minimal template
- Drop Commands section from Comprehensive template (keep Testing for non-obvious testing patterns)
- In SuPi-Optimized, rename Commands → Non-Obvious Commands & Workflows
- Adjust Key Principles: "Actionable: Commands should be copy-paste ready" → "Actionable: Non-obvious guidance should be concrete and copy-paste ready"

### update-guidelines.md
- Section "1. Commands/Workflows Discovered": replace title and `npm run build:prod` example with a non-obvious command/workflow example (e.g., pre-push hook behavior, required flags)
- Add new "What NOT to Add" item: "Routine/easy-to-find commands" (npm install, npm test, npm run build — these are in package.json)
- Update diff-format example: replace `npm run dev`/`npm run build`/`npm test` with non-obvious content
- Tighten "Implication" bullet: "Focus instead on: Non-obvious commands and workflows, ..."
