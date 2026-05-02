## MODIFIED Requirements

### Requirement: Root context is not duplicated at session start
The extension SHALL NOT inject root or ancestor context files that pi has already loaded natively via `systemPromptOptions.contextFiles`. This prohibition SHALL apply on turn 0 and on all later turns, regardless of `rereadInterval`, context usage, compaction, or whether the native file is inside or outside `cwd`. The extension MAY record native context file paths for deduplicating subdirectory discovery, but it SHALL NOT wrap native context file contents in `supi-claude-md` `<extension-context>` blocks or emit `supi-claude-md-refresh` messages.

#### Scenario: Fresh session does not re-inject root CLAUDE.md
- **WHEN** a new session starts and pi provides root `CLAUDE.md` via `systemPromptOptions.contextFiles`
- **THEN** no `supi-claude-md-refresh` message SHALL be emitted on the first `before_agent_start`
- **AND** the root `CLAUDE.md` content SHALL only be present through pi's system prompt

#### Scenario: Periodic interval does not re-inject native context
- **WHEN** `completedTurns` reaches or exceeds `lastRefreshTurn + rereadInterval`
- **AND** pi provides one or more files via `systemPromptOptions.contextFiles`
- **THEN** the extension SHALL NOT emit a `supi-claude-md-refresh` message
- **AND** the extension SHALL NOT add native context file contents to the model-facing message history

#### Scenario: Native files under cwd are not re-injected
- **WHEN** `systemPromptOptions.contextFiles` contains `/Users/alice/projects/myapp/CLAUDE.md` with `cwd` = `/Users/alice/projects/myapp`
- **THEN** the file SHALL NOT be included in any SuPi refresh payload

#### Scenario: Historical refresh messages are not restored
- **WHEN** an older session branch contains stale `supi-claude-md-refresh` custom messages
- **THEN** the context hook SHALL remove or ignore those refresh messages
- **AND** their `details.promptContent` SHALL NOT be restored into the model-facing prompt

## REMOVED Requirements

### Requirement: Compaction-triggered refresh still works
**Reason**: Compaction does not remove pi's system prompt, so re-injecting root/native context after compaction duplicates instructions that remain present in every request.

**Migration**: Do not set a root refresh flag on `session_compact`. If root instruction files change, use pi's `/reload` or restart the session so pi rebuilds the native system prompt.

#### Scenario: Compaction does not force root re-injection
- **WHEN** a `session_compact` event fires
- **THEN** the extension SHALL NOT force a `supi-claude-md-refresh` message on the next `before_agent_start`
- **AND** root instruction context SHALL continue to come from pi's system prompt
