## Context

This repo already uses prompt templates for repeatable workflows, including `packages/supi/prompts/revise-claude-md.md` for end-of-session reflection. For this change, the desired workflow is narrower and repo-specific: after completing a task, an agent should be able to run a manual prompt that evaluates whether SuPi tools were helpful, hard to discover, missing useful capabilities, or adding unnecessary context.

Pi already supports project-local prompt discovery from `.pi/prompts/*.md`, which makes a prompt template the lightest-weight implementation surface. The main constraints are to keep the workflow local to this repo, keep the output in chat rather than files, and make the retrospective specific enough to drive future SuPi improvements instead of producing generic commentary.

## Goals / Non-Goals

**Goals:**
- Add a manual repo-local `/supi-tooling-retro` prompt for post-task reflection.
- Collect structured feedback about helpful tools, missed tool usage, missing capabilities, and unhelpful or token-wasting context.
- Produce a compact markdown brief with prioritized recommendations that can later inform issues or OpenSpec work.
- Keep the flow read-only and safe, with no automatic edits or workflow side effects.

**Non-Goals:**
- Automating retrospective collection through extension hooks or end-of-task detection.
- Publishing this prompt through `packages/supi/` or the `@mrclrchtr/supi` meta-package.
- Creating or editing issues, specs, tasks, or code as part of the retrospective.
- Asking the agent to audit the entire SuPi suite independently of the completed task.

## Decisions

### Use a repo-local prompt template in `.pi/prompts`

**Rationale:** Pi discovers prompt templates from `.pi/prompts/*.md` in the current project, which matches the requirement that this workflow live in the repo rather than the published package. A prompt template also gives the simplest user-facing ergonomics: a manual slash command at the end of a task.

**Alternatives considered:**
- Add the prompt to `packages/supi/prompts/` and ship it with the meta-package. Rejected because the user explicitly wants this workflow to remain repo-local for now.
- Build a skill instead of a prompt. Rejected for v1 because the workflow is a single manual command with no need for extra reference files or scripts.

### Make the prompt evidence-based and task-scoped

**Rationale:** The main risk with a retrospective prompt is generic feedback. The prompt should therefore require the agent to tie claims to the just-completed task, distinguish between direct experience and inference, and call out when a tool existed but was simply not discovered in time.

**Alternatives considered:**
- Allow freeform retrospective prose. Rejected because it would be harder to compare across sessions and would drift toward vague opinions.

### Standardize the markdown output shape

**Rationale:** A fixed structure makes the results easier to scan and easier to turn into later improvements. The output should include task summary, tools used, missed opportunities, missing pieces, unhelpful/noisy context, prioritized recommendations, and confidence/evidence.

**Alternatives considered:**
- Return only bullet-point observations. Rejected because it would weaken prioritization and make later triage harder.
- Emit machine-readable JSON. Rejected for v1 because the primary goal is human review and iteration, not aggregation automation.

### Keep the prompt retrospective-only

**Rationale:** The prompt is intended to improve feedback quality, not to trigger follow-on changes automatically. Explicitly forbidding file edits, issue creation, and OpenSpec updates keeps the command safe to run at the end of any task.

**Alternatives considered:**
- Have the prompt draft issues or update docs immediately. Rejected because that couples reflection with implementation and increases the risk of noisy or premature changes.

## Risks / Trade-offs

- **[Risk]** Because the prompt is manual, agents may forget to run it.
  **Mitigation:** Treat it as a closeout command for targeted sessions and document its use when needed.

- **[Risk]** The retrospective could still become repetitive or generic across tasks.
  **Mitigation:** Require evidence grounded in the specific task and limit recommendations to the highest-value items.

- **[Risk]** Adding too many required sections could make the output verbose.
  **Mitigation:** Instruct the agent to stay compact and prioritize concise bullets over long explanations.

- **[Trade-off]** Keeping the prompt repo-local avoids package bloat but means it is not automatically available in other SuPi installations.
  **Mitigation:** If the workflow proves useful, a later change can promote it into a packaged prompt or paired prompt+skill.

## Migration Plan

No migration is needed. Adding `.pi/prompts/supi-tooling-retro.md` is additive and local to this repository.

## Open Questions

None for v1.
