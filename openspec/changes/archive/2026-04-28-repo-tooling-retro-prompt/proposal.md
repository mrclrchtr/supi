## Why

Agents currently finish tasks in this repo without a consistent way to report whether SuPi tooling was helpful, noisy, hard to discover, or missing key capabilities. A dedicated post-task retrospective prompt would make feedback comparable across sessions and help improve tools, docs, and prompt context more systematically.

## What Changes

- Add a repo-local prompt template at `.pi/prompts/supi-tooling-retro.md` for manual end-of-task tooling retrospectives.
- Instruct the agent to evaluate SuPi tools used during the task, tools that would have helped but were not used, missing utilities or features, and unhelpful or token-wasting context.
- Require a compact markdown brief in chat with prioritized recommendations and explicit confidence/evidence.
- Keep the workflow read-only with no automatic file edits, issue creation, OpenSpec updates, or implementation side effects.

## Capabilities

### New Capabilities
- `tooling-retro-prompt`: Provides a repo-local `/supi-tooling-retro` prompt that gathers structured post-task feedback about SuPi tooling, discoverability, missing features, and noisy context.

### Modified Capabilities
_None._

## Impact

- **Prompt surface**: `.pi/prompts/supi-tooling-retro.md` — new repo-local prompt template for this workspace only.
- **Workflow**: Adds an explicit manual retrospective step that can be run after completing a task.
- **APIs / dependencies**: None.
- **Published packages**: No changes to `packages/supi/` or the published `@mrclrchtr/supi` meta-package.
