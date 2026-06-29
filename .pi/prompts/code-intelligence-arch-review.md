# Code Intelligence Architecture Review

You are an expert code-understanding architect. Your task is to perform a critical, from-scratch review of the SuPi code intelligence stack.

## What to Inspect

Study these three packages thoroughly:

### @packages/supi-code-intelligence/ — the composition layer
This is the umbrella package and the **sole pi extension surface**. It:
- Registers **6 `code_*` tools** — `code_brief`, `code_map`, `code_relations`, `code_affected`, `code_pattern`, `code_refactor`
- Registers **10 `lsp_*` tools** — `lsp_hover`, `lsp_definition`, `lsp_references`, `lsp_implementation`, `lsp_document_symbols`, `lsp_workspace_symbols`, `lsp_diagnostics`, `lsp_rename`, `lsp_code_actions`, `lsp_recover`
- Registers **6 `tree_sitter_*` tools** — `tree_sitter_outline`, `tree_sitter_imports`, `tree_sitter_exports`, `tree_sitter_node_at`, `tree_sitter_query`, `tree_sitter_callees`
- Contains a **planner** that routes `code_*` tool intents to semantic (LSP) or structural (tree-sitter) providers
- Contains **analysis services** (brief, map, relations, affected, pattern, refactor) that compose across substrates
- Manages **session lifecycle** for both LSP and tree-sitter via the shared `supi-code-runtime` broker
- Injects a **first-turn project overview** via `before_agent_start`
- Contains **markdown renderers** for each tool output
- Contains **guidance surfaces** that steer the model toward intent-first tool selection

### @packages/supi-lsp/ — the semantic substrate
A **library-only** package (no extension surface). Provides:
- Multi-language LSP client (typescript, python, rust, bash, etc.)
- `SessionLspService` — session-scoped shared service via `supi-core` registry
- Provider interfaces consumed by supi-code-intelligence's planner
- Diagnostics, workspace sentinel scanning, stale detection, recovery
- All `lsp_*` tool actions are invoked through this library

### @packages/supi-tree-sitter/ — the structural substrate
A **library-only** package (no extension surface). Provides:
- 14 vendored grammar WASM files for web-tree-sitter
- Structural extraction services — `collectOutline`, `extractExports`, `extractImports`, `lookupCalleesAt`, `lookupNodeAt`
- `SessionTreeSitterService` — session-scoped shared service
- `StructuralProvider` impl consumed by supi-code-intelligence's planner

## What to Evaluate

For each `code_*` tool, answer these questions:

### 1. Utility assessment
- What real problem does this tool solve for the agent?
- How often is it actually useful vs. superficial?
- Does it overlap with another tool in a way that confuses the model?
- Is there a simpler way to achieve the same result?

### 2. Design critique
- Does the tool's abstraction match its implementation? (e.g. `code_relations` abstracts away the LSP/tree-sitter split — does this help or hurt?)
- Is the planner routing (semantic vs. structural) the right design or needless indirection?
- Are the parameter shapes well-suited to how agents actually use these tools?
- Is the "intent-first" guidance design (code_* primary, lsp_*/tree_sitter_* as expert fallbacks) working?

### 3. Redesign from scratch
If you could rebuild the entire stack without backward compatibility, address:

- **Tool surface**: How many tools should exist? Which should be merged, dropped, or added?
- **Abstraction layers**: Should `code_*` be thin wrappers around `lsp_*`/`tree_sitter_*`, or should the model call substrates directly? What's the right level of abstraction for an LLM agent?
- **Planner**: Is the current two-tier routing necessary, or can it be simplified? What about the `code-runtime` broker — is it pulling its weight?
- **Package boundaries**: Three packages vs. one? Different split? Does supi-lsp and supi-tree-sitter being library-only (no extensions) make sense?
- **Guidance design**: How should prompt engineering steer the model — intent-first (`code_brief`) vs. substrate-first (`lsp_hover`)? Should guidance live in tool descriptions, system prompts, or both?
- **First-turn overview**: Is injecting an architecture summary at session start valuable? Does the current mechanism work?
- **Output rendering**: Are per-tool markdown renderers the right approach?

### 4. What's missing
- What code-understanding capabilities does a coding agent need that this stack doesn't provide?
- What existing tools are underpowered or have poor ergonomics?
- What would you build if you had LSP + tree-sitter but no existing architecture?

## Output Format

Produce a structured analysis in Markdown with these sections:

```markdown
# Code Intelligence Architecture Review

## Current State Summary
Brief factual summary of what exists.

## Per-Tool Utility Assessment
For each of the 6 code_* tools:
- **Usefulness** (1-5) — how often does an agent actually need this?
- **Overlap** — what other tools does it compete with for the same intent?
- **Design issues** — abstraction mismatch, parameter friction, etc.
- **Verdict** — keep, merge, drop, or redesign

## Substrate Assessment
Evaluate the lsp_* and tree_sitter_* tool surfaces.
- Are all 10 lsp_* tools pulling their weight?
- Are all 6 tree_sitter_* tools pulling their weight?
- Should any substrate tools be removed or demoted?

## Architecture Critique
- Planner routing: helpful or harmful?
- Package boundaries: right split?
- Guidance strategy: working or not?
- First-turn overview: valuable?
- Code-runtime broker: necessary?
- Output rendering approach

## Greenfield Redesign Proposal
Describe your ideal architecture with rationale.
- Tool surface (total count, names, shapes)
- How many layers / packages
- How guidance and routing works
- What you'd drop entirely
- What you'd add

## Priority Recommendations
Ranked list of concrete changes, highest-impact first.
```
