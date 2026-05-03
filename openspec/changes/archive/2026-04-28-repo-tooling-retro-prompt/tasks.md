## 1. Prompt authoring

- [x] 1.1 Create the repo-local prompt template at `.pi/prompts/supi-tooling-retro.md` with frontmatter so pi exposes `/supi-tooling-retro` in this repository.
- [x] 1.2 Write the prompt instructions to produce a structured markdown brief covering task summary, tools used, missed opportunities, missing pieces, unhelpful or noisy context, prioritized recommendations, and confidence/evidence.
- [x] 1.3 Add guardrails that keep the retrospective task-scoped, distinguish direct experience from inference, include the fallback for tasks that used no SuPi tools, and forbid follow-on edits or workflow side effects.

## 2. Validation

- [x] 2.1 Review the prompt text against the new `tooling-retro-prompt` spec requirements and confirm the change stays repo-local with no `packages/supi/` updates.
- [x] 2.2 Reload or start pi in this repository and verify `/supi-tooling-retro` is discoverable from the project `.pi/prompts` directory.
- [x] 2.3 Run `/supi-tooling-retro` after a completed task and confirm the output is compact markdown with prioritized recommendations and no automatic edits.
