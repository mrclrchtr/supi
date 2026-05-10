# supi-flow

Lightweight spec-driven workflow extension for pi. Provides skills for brainstorming, planning, implementing, and archiving changes.

## Commands

```bash
pnpm vitest run packages/supi-flow/
pnpm exec tsc --noEmit -p packages/supi-flow/tsconfig.json
pnpm exec biome check packages/supi-flow/
```

## Architecture

A single extension (`src/index.ts`) wires two non-skill pieces and delegates everything else to skills and prompts auto-discovered from package directories:

- `pi.on("resources_discover")`: registers skill paths under `skills/` and prompt paths under `prompts/`
- `/supi-flow-status`: scans branch entries for `TNDM-XXXXXX` ticket IDs
- `/supi-flow`: lists available flow commands

### Skills

Six skills ship under `skills/`:

| Skill | Trigger | Purpose |
|---|---|---|
| `supi-flow-brainstorm` | `/supi-flow-brainstorm` | Explore intent + design before code |
| `supi-flow-plan` | `/supi-flow-plan [ID]` | Create bite-sized implementation plan |
| `supi-flow-apply` | `/supi-flow-apply` | Execute plan task by task |
| `supi-flow-archive` | `/supi-flow-archive` | Verify, update docs, close out |
| `supi-flow-debug` | Loaded on demand when blocked | Root-cause debugging protocol |

`supi-flow-slop-detect` is a hidden skill loaded on demand during archive.

### Prompt templates

One prompt template is shipped under `prompts/`:

| Prompt | Purpose |
|---|---|
| `supi-coding-retro` | Retrospective on project setup, architecture, tooling, workflows, and conventions |

## Gotchas

- Skills reference each other by `/skill:supi-flow-*` names in their instructions. Keep these in sync when renaming.
- `/supi-flow-status` discovers active tickets by regex-matching `TNDM-\w{6}` in user messages on the active branch. It works for any matching user message, though the ticket skill makes those IDs more likely to be present consistently.
- Extension is intentionally thin. Workflow logic lives in the skill markdown files under `skills/`, and reusable retrospective prompt text lives under `prompts/`.
