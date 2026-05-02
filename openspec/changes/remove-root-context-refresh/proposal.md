## Why

Pi already loads root/ancestor `AGENTS.md` and `CLAUDE.md` context files into the system prompt, and that system prompt is sent on every model request. `supi-claude-md` currently re-injects project-root native context as persistent refresh messages after an interval, duplicating prompt content and wasting context.

## What Changes

- Remove periodic root/native context refresh from `supi-claude-md`.
- Stop emitting `supi-claude-md-refresh` messages from `before_agent_start` for files present in `systemPromptOptions.contextFiles`.
- Keep subdirectory discovery as the extension's context-injection mechanism for instruction files not already loaded natively by pi.
- Re-scope `rereadInterval` to subdirectory re-read behavior only; `0` disables subdirectory re-read while first-time subdirectory discovery remains controlled by `subdirs`.
- Update documentation, settings labels/descriptions, and tests to reflect that root instruction updates require pi reload/system-prompt refresh rather than SuPi re-ingestion.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `root-refresh-dedup`: Replace periodic root refresh requirements with a stronger requirement that native context files are never re-injected by `supi-claude-md`.
- `native-context-scoping`: Change native context handling from "exclude files above cwd" to "exclude all pi-native context files from SuPi injection payloads".
- `context-aware-injection`: Remove root-refresh threshold behavior; keep threshold behavior for subdirectory re-injection.
- `claude-md-settings-ui`: Update `rereadInterval` semantics and UI copy so it no longer describes root refresh.
- `context-renderers`: Remove the requirement for active `supi-claude-md-refresh` rendering if root refresh messages are no longer emitted.

## Impact

- Affected package: `packages/supi-claude-md`.
- Affected docs/resources: package README, `supi-claude-md-guide`, and any root-refresh wording in package-local context files.
- Affected specs: root refresh/dedup, native context scoping, context-aware injection, settings UI, and context renderer behavior.
- No dependency or public package API changes are expected; configuration remains compatible, but `rereadInterval` becomes subdirectory-only.
