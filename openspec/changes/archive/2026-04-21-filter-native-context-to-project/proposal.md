## Why

supi-claude-md re-injects ALL files from pi's `systemPromptOptions.contextFiles` as persistent refresh messages — including files outside the project tree like `~/AGENTS.md`. pi already loads those files natively into the system prompt, so the extension duplicates them every N turns, wasting context and injecting irrelevant instructions (e.g., chezmoi dotfiles conventions into a TypeScript monorepo session).

## What Changes

- `readNativeContextFiles` in `refresh.ts` will filter out files whose path resolves outside the project tree (above cwd)
- Files within cwd are re-injected as before; files above cwd (e.g., `~/AGENTS.md`) are excluded since pi already provides them natively

## Capabilities

### New Capabilities

- `native-context-scoping`: Filter native context files to project scope before re-injection, excluding files above the project root

### Modified Capabilities

- `root-refresh-dedup`: Requirement unchanged (dedup at session start still works), but implementation now also excludes out-of-project files from the refresh payload

## Impact

- `packages/supi-claude-md/refresh.ts` — `readNativeContextFiles` signature and logic
- `packages/supi-claude-md/index.ts` — call site passes `cwd` to `readNativeContextFiles`
- Existing tests for `readNativeContextFiles` need updating for new `cwd` parameter
- New test cases for filtering above-cwd files
