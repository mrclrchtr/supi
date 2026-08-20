# SuPi docs index

Reference material for agents that develop PI extensions in this repo. Docs here are facts, rules, checklists, and examples — no narrative prose.

## Reading order

1. Installed PI docs first (`docs/index.md` of `@earendil-works/pi-coding-agent`) — never assume PI APIs from memory.
2. `pi/` below — PI mechanics that affect extension design, verified against installed PI docs.
3. `conventions/` below — SuPi conventions for package layout, tool architecture, and rendering.
4. Per-package `CLAUDE.md` — package-specific gotchas; surfaced by `code_orientation(focus={path: "packages/..."})`.

## pi/ — PI mechanics for extension developers

| Doc | Answers | Read when |
| --- | --- | --- |
| `pi/tool-guidance.md` | How to design and register PI tools with minimal context cost: placement rules (prefix vs. result vs. free channels), naming, metadata budgets, output limits, checklist | You add or change any model-callable tool |
| `pi/context-architecture.md` | What PI sends to the model and what it costs: billing tiers (prefix / additions / cache breaks), cache breakpoints, free channels, index into official Pi docs, extension hooks for context control | You touch system prompts, tool metadata, injected messages, history, or compaction |
| `pi/model-call.md` | How an extension calls models directly via `@earendil-works/pi-ai` | You need a model call outside the agent loop |

## conventions/ — SuPi conventions

| Doc | Answers | Read when |
| --- | --- | --- |
| `conventions/package-layout.md` | Package directory structure, boundary files (`api.ts` / `index.ts` / `extension.ts`), test layout, per-package target matrix | You create a package or do structural work on one |
| `conventions/tool-architecture.md` | Internal architecture for tool packages: spec/guidance modules, workflow, result assembly, presentation adapters, PI adapter | You add or restructure a package that registers tools |
| `conventions/tool-rendering.md` | Transcript rendering: `renderCall`/`renderResult`, `details` contract, collapsed/expanded/partial/error states | You add or change tool renderers |
| `conventions/code-runtime-architecture.md` | Ownership split of the code stack: `supi-code-intelligence`, `supi-lsp`, `supi-tree-sitter`, `supi-code-runtime` | You work on the code-understanding stack |

## adr/ and agents/

- `adr/` — architecture decision records. Read only the ADRs for the subsystem you change.
- `agents/` — issue tracker and triage workflow for agent work in this repo.

## ops/

`ops/` holds benchmarking and Snyk operational notes. They are not part of extension development.

## Maintenance rules

- Keep docs as reference material: rules, tables, checklists, code examples. Remove narrative prose.
- Add new docs under `pi/` (PI mechanics, must be verified against installed PI docs) or `conventions/` (SuPi choices), and add a row to this index.
- Keep links relative so moves stay cheap.
