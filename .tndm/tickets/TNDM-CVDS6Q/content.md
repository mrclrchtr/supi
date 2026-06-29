# Stricter content filtering in claude-md skills

Reframe the claude-md skills (improver + revision) and their shared references around a single sharper distinction: **non-obvious** content belongs in CLAUDE.md; **routine/easy-to-find** content does not.

## Problem

The skills currently treat routine build/test commands as positive CLAUDE.md content. They appear in:
- **scoring** as the first criterion (15 pts, literally asks "are build/test/deploy commands present?")
- **templates** as the headliner section (Commands always first)
- **update guidelines** as the primary "what to add" example (`npm run build:prod`)
- **SKILL.md instructions** as recommended content

But routine commands are trivially discoverable from `package.json` — they don't earn their space in the context window.

## Design

Apply the non-obvious vs routine distinction consistently across all six files:

### quality-criteria.md (both copies)
- Rename Criterion 1 from "Commands/Workflows" → "Non-Obvious Commands & Workflows"
- Flip scoring: reward gotcha-commands and workflow patterns not in package.json; penalize routine install/build/test/lint listings
- Remove "Build, test, lint, deploy commands present" from the 15-point description

### templates.md (both copies)
- Replace `## Commands` section template with `## Non-Obvious Commands & Workflows` that explicitly warns against listing routine commands
- Drop Commands section from Minimal and Comprehensive templates; rename in SuPi-Optimized
- Adjust Key Principles: "Actionable: commands should be copy-paste ready" → focus on non-obvious content being actionable

### update-guidelines.md (both copies)
- Move routine commands from "What TO Add" to a new "What NOT to Add" item: "Routine/easy-to-find commands"
- Replace `npm run build:prod` example with a non-obvious command or gotcha
- Update diff-format example to use non-obvious content
- Tighten "Implication" bullet to distinguish routine vs non-obvious commands

### claude-md-improver/SKILL.md
- Phase 3 checklist: update Criterion 1 wording
- Phase 5 guidelines: qualify "commands or workflows" to non-obvious only
- Phase 5 diff example: replace build command example
- Common Issues to Flag: reframe "stale commands" / "broken test commands"
- What Makes a Great CLAUDE.md: replace "Commands (build, test, dev, lint)" with non-obvious guidance

### claude-md-revision/SKILL.md
- "What TO capture": qualify "Commands/workflows" as non-obvious only
- "What NOT to capture": add "Routine/easy-to-find commands (in package.json, README)"
- Diff format example: replace `pnpm vitest` routine command example with a non-obvious gotcha

### evals.json
- Evals 1-3 already test for gotcha/non-obvious content — prompts/expected_output stay
- Add an expectation to eval 1: the skill does NOT propose adding routine commands from package.json

## Non-goals
- Not removing the concept of commands/workflows entirely — non-obvious ones remain valuable
- Not touching Architecture, Gotchas, Start Here sections
- Not changing packages/supi-claude-md/CLAUDE.md (package's own dev instructions, not skill guidance)

## Verification
- `pnpm vitest run packages/supi-claude-md/__tests__/unit/skill-references-sync.test.ts` must still pass (files stay byte-identical)
- Manual review of each changed file for consistency with the non-obvious principle
- `pnpm exec biome check packages/supi-claude-md/skills/` must pass
