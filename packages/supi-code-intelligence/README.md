# @mrclrchtr/supi-code-intelligence

Project understanding for PI — your agent knows your codebase before you ask.

The first thing an agent does in a new project is read files to figure out what's there. Code Intelligence skips that — it auto-injects a compact project map on turn one, so the agent is already oriented.

Beyond the overview, it gives the agent high-level analysis: architecture briefs, impact assessment, call tracing, and smart search that knows when to use LSP vs. tree-sitter vs. text search.

## What you get

### Instant orientation

Every session starts with a project map in the agent's context: what packages exist, how they depend on each other, which files matter. The agent walks in knowing your codebase instead of discovering it file by file.

### Architecture-level questions

Ask "what's in this package?" or "what depends on this module?" The agent gets a structural answer, not a file listing.

### Impact analysis

Before a change: "show me everything that would break." The agent sees direct callers, downstream dependents, and risk level — before touching code.

### Smarter search

`code_intel pattern` is text search that knows about code structure. Search for definitions (not just any text match), group by directory, or filter by import/export. Falls back from LSP to tree-sitter to ripgrep automatically.

## Install

```bash
pi install npm:@mrclrchtr/supi-code-intelligence
```

## Quick look

| Action | What the agent can ask |
|--------|----------------------|
| `brief` | "Summarize this package / file / project" |
| `callers` | "Who calls this function?" |
| `callees` | "What does this function call?" |
| `affected` | "What breaks if I change this?" |
| `pattern` | "Find this text / pattern" |
| `index` | "What's in this project?" |
| `implementations` | "What implements this interface?" |

Every result includes a confidence label (semantic / structural / heuristic) so the agent knows how much to trust the answer.

## For extension developers

The architecture model and brief generator are exported for reuse:

```ts
import { buildArchitectureModel, generateOverview } from "@mrclrchtr/supi-code-intelligence";

const model = await buildArchitectureModel("/project");
const overview = generateOverview(model);
```
