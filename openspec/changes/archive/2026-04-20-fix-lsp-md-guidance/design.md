## Context

The LSP extension includes a bash guard (`bash-guard.ts`) that hard-blocks `rg`/`grep` commands when the agent's prompt contains semantic keywords and there is active LSP coverage. This is too aggressive:

1. **False positives on unsupported file types** — `.md`, `.json`, `.yaml` files get blocked when `.ts` LSP coverage is active nearby.
2. **Fights agent autonomy** — the agent chose `rg` for a reason (project-wide search, string patterns, etc.). Blocking wastes a turn.
3. **Redundant with prompt steering** — `promptGuidelines` already tells the agent to prefer LSP for semantic queries. The hard block is a second forceful layer.

## Goals / Non-Goals

**Goals:**
- Replace the hard block with a soft, informational nudge appended to bash tool results.
- Only nudge when the search targets are LSP-supported files — never nudge for `.md`, `.json`, etc.
- Let the agent decide whether to follow the nudge.

**Non-Goals:**
- Parsing every possible bash search command variant — cover `rg`, `grep`, `ack`, `ag`, `git grep` with best-effort path extraction.
- Changing runtime guidance (`before_agent_start`) or diagnostic injection — those already gate correctly.

## Decisions

### 1. Soft nudge via `tool_result` instead of hard block via `tool_call`

**Decision**: Remove the `tool_call` handler that blocks bash commands. Instead, append an informational note to the `tool_result` when the conditions are met.

**Rationale**: The `tool_result` hook already exists and is the natural place for informational augmentation. The agent sees the suggestion but can choose to ignore it. No turns wasted, no autonomy violation.

**Alternatives considered**:
- Keep blocking with file-type gate — still aggressive, still fights the agent.
- Remove the guard entirely — valid, but the nudge adds value when the agent genuinely doesn't know LSP is available.

### 2. Gate nudges on LSP-supported target files

**Decision**: Extract target paths from the bash command and check each against `LspManager.isSupportedSourceFile()`. Only nudge if at least one target is LSP-supported.

**Rationale**: Searching `.md` files should never trigger an LSP nudge. The `isSupportedSourceFile` method already consults the server config and command availability.

### 3. Keep the nudge brief and non-prescriptive

**Decision**: A one-line note like `"💡 LSP is active for these files — consider the lsp tool for semantic queries."` appended to the tool result content.

**Rationale**: The agent doesn't need a paragraph — it already knows about LSP from the system prompt. A brief hint is enough.

## Risks / Trade-offs

- **Agent may ignore nudges** → Acceptable. The prompt steering is the primary mechanism; the nudge is a bonus.
- **Incomplete command parsing** → If targets can't be extracted, skip the nudge. False negatives are harmless.
- **Nudge adds noise** → Only appears when semantic prompt + text search + LSP-supported targets all match. Narrow enough to be low-noise.
