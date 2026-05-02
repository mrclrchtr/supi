## Context

Pi discovers root and ancestor instruction files (`AGENTS.md` / `CLAUDE.md`) and includes them in the system prompt. The current `supi-claude-md` implementation also has a `before_agent_start` root refresh path that reads `event.systemPromptOptions.contextFiles`, wraps eligible files in `<extension-context>`, and stores them as a persistent custom message with `customType: "supi-claude-md-refresh"`. This was intended to keep native context fresh, but it duplicates files already present in every request's system prompt.

Subdirectory discovery is separate: when path-aware tool results reference a file under cwd, SuPi finds directory-specific instruction files below the project root and appends them to the tool result. That remains useful because pi's native context discovery only loads global/ancestor/current-directory context at startup, not every nested package's local guidance.

## Goals / Non-Goals

**Goals:**

- Ensure `supi-claude-md` never re-injects files supplied by pi's native `systemPromptOptions.contextFiles`.
- Remove periodic root refresh messages and their pruning/formatting/runtime state from active behavior.
- Preserve subdirectory discovery, native-path filtering for subdirectory injection, context-threshold gating for subdirectory re-injection, and session reconstruction for injected subdirectory state.
- Keep existing config shape compatible while changing `rereadInterval` to mean subdirectory re-read interval only.
- Update docs, settings text, and tests so users understand that root instruction changes require `/reload` or session restart.

**Non-Goals:**

- Changing pi's native context-file discovery or system prompt generation.
- Adding a file watcher for root instruction files.
- Removing `CLAUDE.md` / `AGENTS.md` support for subdirectory discovery.
- Introducing a new config migration or breaking existing `claude-md` config files.

## Decisions

### Decision: remove root refresh instead of narrowing its file filter

The implementation should stop returning `supi-claude-md-refresh` messages from `before_agent_start` entirely. Filtering out only cwd-root files would still leave SuPi re-emitting other pi-native context files, which has the same duplication problem because all `systemPromptOptions.contextFiles` entries are already part of the system prompt.

**Alternative considered:** Keep periodic refresh for files under cwd but outside the root. Rejected because those files are still native context if they appear in `systemPromptOptions.contextFiles`, and extension-level refresh cannot reliably distinguish "needed freshness" from duplication.

### Decision: keep native context path capture for subdirectory deduplication

`captureNativePaths()` should continue recording native context file paths on the first `before_agent_start`, because `tool_result` subdirectory discovery uses `filterAlreadyLoaded()` to avoid injecting context files pi already loaded. The root refresh payload builder can be removed or made inert, but native path capture remains valuable.

**Alternative considered:** Remove all `before_agent_start` handling from `supi-claude-md`. Rejected because that would also remove native-path capture and could reintroduce duplicate subdirectory injections when pi has already loaded a context file natively.

### Decision: preserve `rereadInterval` as subdirectory-only configuration

The config key should remain to avoid breaking existing config and because subdirectory re-injection still uses the same interval. Settings labels/descriptions and docs should describe it as a context re-read interval for previously injected subdirectories, not a root refresh interval.

**Alternative considered:** Rename the config key to `subdirRereadInterval`. Rejected for this change because it adds migration complexity without changing runtime capability; a future breaking cleanup can rename it if desired.

### Decision: retire the active refresh renderer contract

If no `supi-claude-md-refresh` messages are emitted, the renderer is no longer an observable capability. The code may remove the renderer registration or leave a harmless compatibility renderer, but specs and tests should not require it. If left in place temporarily, it must not imply root refresh is still active.

## Risks / Trade-offs

- **Root instruction file edits during a session are no longer auto-refreshed by SuPi** → Use pi's `/reload` or restart the session; this matches native system-prompt ownership and avoids duplicate prompt content.
- **Existing users may expect `rereadInterval` to refresh root files** → Update README, skill guide, settings copy, and tests to make the new subdirectory-only semantics explicit.
- **Removing refresh state could affect session reconstruction tests** → Update reconstruction to keep only state still needed for subdirectory injection, or retain token parsing only if a compatibility renderer/context-pruning path remains.
- **Stale historical `supi-claude-md-refresh` messages may exist in old sessions** → The context hook should continue pruning or ignoring stale refresh messages during transition so old sessions do not leak duplicate prompt content.
