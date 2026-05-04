# supi-flow

**Lightweight spec-driven workflow for pi.**

Brainstorm → plan → apply → archive. Optional tndm ticket tracking.

## Skills

| Skill | Description |
|-------|-------------|
| `supi-flow-brainstorm` | HARD-GATE before any implementation — explores intent, design, and approach. Creates a tndm ticket when the change spans multiple sessions. |
| `supi-flow-plan` | Create implementation plan — bite-sized tasks, exact file paths, no placeholders. |
| `supi-flow-apply` | Execute plan task by task — stop when blocked, commit after each step. |
| `supi-flow-archive` | Verify against plan, update living documentation, slop-scan prose, close out. |
| `supi-flow-slop-detect` | Hidden skill — detect and fix AI-generated prose markers in documentation. Loaded on demand during archive. |

## Commands

| Command | Description |
|---------|-------------|
| `/supi-flow-status` | Show active tndm tickets from session history. |
| `/supi-flow` | List available flow commands. |

## Usage

```bash
# Install
pi install npm:@mrclrchtr/supi-flow

# Workflow
/skill:supi-flow-brainstorm     # or $supi-flow-brainstorm
/skill:supi-flow-plan [TNDM-ID]
/skill:supi-flow-apply [TNDM-ID]
/skill:supi-flow-archive [TNDM-ID]
/supi-flow-status
```

Tickets are optional — small single-session changes skip tndm entirely. Plans live in conversation context.

## Inspiration

Distills the best parts of [OpenSpec](https://github.com/Fission-AI/OpenSpec) (artifact structure, checkbox tracking), [Superpowers](https://github.com/obra/superpowers) (HARD-GATE before implementation, verification iron law, bite-sized tasks, no placeholders), and [Claude Night Market](https://github.com/athola/claude-night-market) (slop-detection vocabulary, documentation quality gates) — without the CLI, config files, or multi-file ceremony.
