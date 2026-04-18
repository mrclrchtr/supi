## Context

Pi loads `CLAUDE.md` / `AGENTS.md` from `~/.pi/agent/`, ancestor directories (walking up from cwd), and cwd itself — all at startup, injected into the system prompt. Subdirectory context files below cwd are never loaded. Over long sessions, even the root context drifts out of relevance as compaction summarizes it away.

Claude Code solves both problems: it injects subdirectory context on file access and periodically re-injects root context. SuPi should provide equivalent behavior as a pi extension, without the prompt cache pollution or extra LLM turns that naïve injection would cause.

The existing SuPi extension `supi-lsp` already established a pattern for zero-cost context injection: `before_agent_start` returns a persistent message, and a `context` event handler prunes stale copies. This design extends that pattern and extracts shared infrastructure into `supi-core`.

## Goals / Non-Goals

**Goals:**

- Automatically inject subdirectory `CLAUDE.md` / `AGENTS.md` when the agent accesses files there
- Periodically re-inject root context files to keep the agent anchored
- Re-inject after compaction (which summarizes context away)
- Zero prompt cache pollution (never modify system prompt dynamically)
- Zero extra LLM turns (never trigger additional API calls)
- Deterministic on restart (reconstruct state from session history)
- Global + per-project configuration via JSON files
- Configurable context file names (beyond just CLAUDE.md / AGENTS.md)
- Establish shared SuPi infrastructure: `<extension-context>` XML tag convention, unified config system, `/supi-*` command prefix
- supi-lsp can adopt supi-core in a follow-up change

**Non-Goals:**

- Parsing file paths from `bash` command strings (fragile; stick to tools with explicit path inputs)
- Per-session config overrides (global + project is sufficient)
- Replacing pi's native context file loading (we augment, not replace)
- Backward compatibility with `pi-reread-instructions` or awareness of it
- Migrating supi-lsp's existing `.pi-lsp.json` config (separate follow-up)

## Decisions

### D1: Subdirectory injection via `tool_result` augmentation

Append context file content to the tool result of `read`, `write`, `edit`, `ls`, and `lsp` tools. The content is part of the result that was already being sent to the LLM — zero extra turns, zero cache pollution.

**Alternatives considered:**
- `sendMessage(steer)` — risks triggering an extra LLM call if it arrives after the agent's last tool call in a turn
- `before_agent_start` message — delayed until next user prompt; not immediate when the agent reads a file mid-turn
- `context` event message injection — ephemeral, not persisted; would need re-injection every turn

**Why tool_result:** Most immediate (context appears right next to the file being accessed), zero cost, and naturally persists in session history for reconstruction.

### D2: Root refresh via `before_agent_start` + `context` event pruning

Identical pattern to supi-lsp's diagnostics injection. `before_agent_start` returns a persistent message with `customType: "supi-claude-md-refresh"` and a `contextToken` in details. The `context` event handler prunes stale copies (old tokens) and reorders the current copy before the last user message.

**Why not tool_result for root refresh:** Root refresh is proactive (time-based), not reactive to file access. `before_agent_start` fires on every user prompt — the right cadence for periodic refresh.

### D3: State reconstruction from session history (no `appendEntry`)

On `session_start`, scan `ctx.sessionManager.getBranch()` to reconstruct:
- **completedTurns**: count assistant messages with `stopReason: "stop"`
- **lastRefreshTurn**: find last custom message with `customType: "supi-claude-md-refresh"`, read `turn` from details
- **injectedDirs**: scan tool result content for `<extension-context source="supi-claude-md" file="..." turn="...">` tags

**Why no appendEntry:** Avoids JSONL bloat, no state schema to maintain, no replay logic. All state is already present in session history as a side effect of injection. Deterministic across `/reload`, `/resume`, `/fork`.

### D4: Subdirectory staleness = same reread interval

When the agent accesses a file in a directory whose context was already injected N+ turns ago, re-inject. Uses the same `rereadInterval` config as root refresh. Checked in the `tool_result` handler.

### D5: Shared config via `~/.pi/agent/supi/config.json` and `.pi/supi/config.json`

One JSON file per scope with namespaced sections per extension. Resolution: hardcoded defaults ← global ← project.

**Why not pi's settings.json:** Pi's settings API is not extensible by extensions. Own config file gives full control.

**Why shared file (not per-extension files):** Users manage one file. The concurrent write risk is negligible — config writes only happen on explicit user commands. One extension's malformed JSON could affect others, but that's a user error with a clear fix.

### D6: XML tag `<extension-context source="..." attrs>` as shared convention

Structured XML tags make context blocks machine-parseable (for reconstruction) and LLM-friendly. The `source` attribute identifies the producing extension. Additional attributes (`file`, `turn`) carry metadata without affecting content.

Extracted into `supi-core` so `supi-lsp` and future extensions use the same format.

### D7: Deduplication against pi's native context files

`before_agent_start` provides `event.systemPromptOptions.contextFiles` — an array of `{ path, content }` for files pi already loaded. Extract their paths and skip them during subdirectory discovery. Any directory at or above cwd is already covered by pi's native walk-up behavior.

### D8: Walk-up from file directory, stop at cwd

When the agent accesses `packages/supi-lsp/src/foo.ts`, walk up from `packages/supi-lsp/src/` collecting context files, stop at cwd. This finds `packages/supi-lsp/CLAUDE.md` and `packages/CLAUDE.md` (if they exist) but does not re-discover files already loaded by pi natively.

## Risks / Trade-offs

- **[Duplicate content in session history]** Subdirectory re-injection via tool_result creates duplicate content (old injection + new injection) in the session. → Compaction handles this naturally. The duplication is bounded (one extra copy per refresh per directory).

- **[Tool result content parsing for reconstruction]** Scanning tool result strings for our XML tag is fragile compared to structured entries. → The tag format is distinctive (`<extension-context source="supi-claude-md"`) and attributes are machine-parseable. Regex is reliable here.

- **[Shared config file corruption]** One extension writing bad JSON breaks config for all SuPi extensions. → Config write uses read-modify-write with JSON.parse/stringify. If parse fails on read, fall back to hardcoded defaults. Clear error message via `ctx.ui.notify`.

- **[Post-compaction refresh timing]** `session_compact` fires after compaction, but we can't inject there without triggering a turn. → Set `needsRefresh = true` flag; inject on next `before_agent_start` (next user prompt). Acceptable delay.

- **[Multiple context files per directory chain]** Walking up from a deeply nested file could discover many context files. → Capped by depth (stop at cwd). Typical monorepos have 1–2 context files in subdirectories.
