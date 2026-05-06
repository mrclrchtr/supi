# supi-flow

Lightweight spec-driven workflow extension for pi. Provides skills for brainstorming, planning, implementing, and archiving changes.

## Commands

```bash
pnpm vitest run packages/supi-flow/
pnpm exec tsc --noEmit -p packages/supi-flow/tsconfig.json
pnpm exec biome check packages/supi-flow/
```

## Architecture

A single extension (`src/index.ts`) wires two non-skill pieces and delegates everything else to skills auto-discovered from `skills/`:

- `pi.on("resources_discover")` — registers skill paths under `skills/`
- `/supi-flow-status` — scans branch entries for `TNDM-XXXXXX` ticket IDs
- `/supi-flow` — lists available flow commands

### Skills

Five skills shipped under `skills/`:

| Skill | Trigger | Purpose |
|---|---|---|
| `supi-flow-brainstorm` | `/supi-flow-brainstorm` | Explore intent + design before code |
| `supi-flow-plan` | `/supi-flow-plan [ID]` | Create bite-sized implementation plan |
| `supi-flow-apply` | `/supi-flow-apply` | Execute plan task by task |
| `supi-flow-archive` | `/supi-flow-archive` | Verify, update docs, close out |
| `supi-flow-debug` | Loaded on demand when blocked | Root-cause debugging protocol |

`supi-flow-slop-detect` is a hidden skill loaded on demand during archive.

## Gotchas

- Skills reference each other by `/skill:supi-flow-*` names in their instructions — keep these in sync when renaming.
- `/supi-flow-status` discovers active tickets by regex-matching `TNDM-\w{6}` in user messages on the active branch — this only works when the ticket skill tags messages.
- Extension is intentionally thin; all substantive workflow logic lives in the skill markdown files under `skills/`.
