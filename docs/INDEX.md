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
| `pi/context-architecture.md` | What PI sends to the model and what it costs: billing tiers, cache breakpoints, free channels, raw history vs. projected context, persistent edits, request hooks, and lifecycle boundaries | You touch system prompts, tool metadata, injected messages, history, or compaction |
| `pi/model-call.md` | PI-owned requests, the shared SuPi completion module, and separate routing identities | You need a model call outside the agent loop |

## conventions/ — SuPi conventions

| Doc | Answers | Read when |
| --- | --- | --- |
| `conventions/package-layout.md` | Package directory structure, boundary files (`api.ts` / `index.ts` / `extension.ts`), test layout, per-package target matrix | You create a package or do structural work on one |
| [Testing convention](conventions/testing.md) | Test admission, meaningful behavior and contract coverage, independent expectations, and review/cleanup rules | You add, change, review, or remove tests |
| [Child codemode](conventions/child-codemode.md) | Opt-in Agent and Reviewer codemode: scoped tools, auxiliary-model authorization, lifecycle, and verification | You implement codemode for child sessions |
| [Agent Run retrospectives](conventions/agent-run-retrospectives.md) | Optional post-result assessment turn, Debug opt-in and logging, lifecycle boundaries, and user-requested historical gathering | You implement or discuss Agent Run retrospectives or gather past feedback |
| [Installer design](conventions/installer.md) | Approved npx CLI design: two-scope Installation Matrix, presets, trust, source limits, failures, and verification requirements | You implement or change the SuPi installer |
| `conventions/tool-architecture.md` | Internal architecture for tool packages: per-tool directory layout, spec/guidance modules, workflow, result assembly, presentation adapters, PI adapter, context-channel ownership | You add or restructure a package that registers tools |
| `conventions/tool-rendering.md` | Transcript rendering: `renderCall`/`renderResult`, `details` contract, collapsed/expanded/partial/error states | You add or change tool renderers |
| `conventions/code-runtime-architecture.md` | Ownership split of the code stack: `supi-code-intelligence`, `supi-lsp`, `supi-tree-sitter`, `supi-code-runtime` | You work on the code-understanding stack |
| [Code language capability baseline](conventions/code-language-baseline.md) | Approved, not-yet-qualified baseline for six language families: operations, source-form limits, C/C++ associations, and required Linux/macOS verification | You implement or verify language compatibility in the code-understanding stack |
| [CI verification selection](conventions/ci-verification.md) | Conservative matrix selection, required checks, manual full verification, and Renovate grouping | You change CI jobs, workspace dependencies, or dependency-update policy |

## adr/ and agents/

- `adr/` — architecture decision records. Read only the ADRs for the subsystem you change.
- [ADR 0023: PI-owned model requests](adr/0023-pi-owned-model-requests.md) — shared direct request handling, separate routing identities, and Agent Run endpoint preservation.
- [ADR 0024: Shared code-intelligence exclusions](adr/0024-shared-code-intelligence-exclusions.md) — one configured list for automatic LSP work and broad AST searches.
- [ADR 0022: Request-confirmed, LSP-agnostic diagnostics](adr/0022-request-confirmed-lsp-agnostic-diagnostics.md) — current diagnostic source, confirmation, scheduling, and coverage policy; supersedes the diagnostic-confirmation parts of ADR 0020.
- [ADR 0025: Installation Matrix declarations](adr/0025-installation-matrix-declarations.md) — direct package declarations stay separate from effective resource activation.
- [Code Intelligence: bounded workspace observations](../packages/supi-code-intelligence/docs/adr/0003-bounded-workspace-orientation.md) — generic inventories, native declarations, output budgets, captured results, and instruction delivery.
- `agents/` — issue tracker and triage workflow for agent work in this repo.

## ops/

`ops/` holds operational notes and investigation reports.

- [Session Capability Profiles](ops/session-capability-profiles-design.md) — approved profile configuration, session-copy rules, selector behavior, and implementation checks.
- [Web Search design investigation](ops/web-search-design.md) — approved bx search design, automated verification, and live tool checks.
- [Issue 402 model requests](ops/issue-402-model-requests.md) — approved design and verification record for OpenCode routing, effective endpoints, cache separation, and suggestion warnings.
- [Issue 407 follow-ups](ops/issue-407-follow-ups.md) — approved follow-up specification and verification record.
- [Issue 407: TypeScript diagnostics and request-based confirmation](ops/issue-407-push-diagnostics.md) — historical measurements and current implementation status for request-confirmed diagnostics.

## Package design references

- [Background delegation](../packages/supi-agent/docs/background-delegation.md) — approved execution, completion, cancellation, capacity, and Usage accounting for background Agent Runs.
- [Resumable Delegation Conversations](../packages/supi-agent/docs/resumable-conversations.md) — reusable child context, parent-owned persistence, branch behavior, and follow-up Agent Runs.

## Design examples

- Code Intelligence output comparison: [pre-change output](../packages/supi-code-intelligence/docs/orientation/current.md) and [approved target](../packages/supi-code-intelligence/docs/orientation/target.md). Each file contains only frozen agent-visible design examples. Their temporary capture paths can expire.

## Maintenance rules

- Keep docs as reference material: rules, tables, checklists, code examples. Remove narrative prose.
- Add new docs under `pi/` (PI mechanics, must be verified against installed PI docs) or `conventions/` (SuPi choices), and add a row to this index.
- Keep links relative so moves stay cheap.
