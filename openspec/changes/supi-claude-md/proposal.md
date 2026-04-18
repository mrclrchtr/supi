## Why

Pi only loads `CLAUDE.md` / `AGENTS.md` from the current directory and ancestors (walking up). Subdirectory context files are completely ignored, and root context drifts out of relevance over long sessions as it gets compacted away. Agents forget to manually read subdirectory files even when the root file explicitly tells them to. Claude Code solves both problems — we should too.

## What Changes

- **New extension `supi-claude-md`**: Compound extension with two capabilities — subdirectory context discovery and root context refresh — using zero-cost injection methods (no prompt cache pollution, no extra LLM turns).
- **New package `supi-core`**: Shared SuPi infrastructure — XML `<extension-context>` tag convention and unified config system (`~/.pi/agent/supi/config.json` global, `.pi/supi/config.json` per-project).
- **New command prefix convention**: All SuPi commands use `/supi-*` prefix going forward. `supi-claude-md` launches with `/supi-claude-md`.
- `supi-lsp`: Adopt `supi-core` for `<extension-context>` formatting and rename `/lsp-status` → `/supi-lsp` (separate follow-up change).
- `supi` meta-package: Add `supi-claude-md` and `supi-core` as dependencies.

## Capabilities

### New Capabilities

- `subdir-discovery`: Discover and inject `CLAUDE.md` / `AGENTS.md` from subdirectories below cwd when the agent accesses files there. Inject via `tool_result` augmentation on `read`, `write`, `edit`, `ls`, `lsp` tools. Refresh stale injections after N turns. Walk up from file directory, stop at cwd. Deduplicate against pi's natively loaded context files.
- `root-refresh`: Periodically re-inject root/ancestor context files that pi loaded at startup. Inject via `before_agent_start` persistent messages with `context` event pruning of stale copies. Triggers: every N completed assistant turns (default 3), after compaction, and manual `/supi-claude-md refresh`.
- `supi-config`: Shared configuration system for all SuPi extensions. Global config at `~/.pi/agent/supi/config.json`, project overrides at `.pi/supi/config.json`. Namespaced sections per extension. Read/write/merge utilities.
- `extension-context-tag`: Shared XML tag convention `<extension-context source="..." ...>` for injecting structured context into LLM messages without polluting the system prompt. Supports arbitrary attributes for metadata (e.g., `file`, `turn`).

### Modified Capabilities

_(None — existing specs are unaffected. supi-lsp adoption of supi-core is a separate follow-up change.)_

## Impact

- **New packages**: `packages/supi-core/`, `packages/supi-claude-md/`
- **Modified packages**: `packages/supi/` (add dependencies)
- **Dependencies**: `supi-claude-md` depends on `supi-core`; `supi-core` has no SuPi dependencies (only `@mariozechner/pi-coding-agent` peer dep)
- **Config files**: New directories `~/.pi/agent/supi/` and `.pi/supi/` created on first config write
- **Session history**: Extension injects custom messages (`supi-claude-md-refresh`) and augments tool result content with `<extension-context>` XML tags. State reconstructed from session history on `session_start` — no `appendEntry` needed.
- **Convention**: Establishes `/supi-*` command prefix and shared config pattern for future SuPi extensions
