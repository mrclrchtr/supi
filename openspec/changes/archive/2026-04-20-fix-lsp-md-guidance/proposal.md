## Why

The LSP extension includes a bash guard that **hard-blocks** `rg`/`grep` commands when the agent's prompt contains semantic keywords and there is active LSP coverage. This is too aggressive — it fights the agent's autonomy, produces false positives on unsupported file types (`.md`, `.json`), and wastes turns when the agent has a legitimate reason to use text search. The `promptGuidelines` on the `lsp` tool already steer the agent toward LSP for semantic queries, making the hard block redundant.

## What Changes

- Replace the hard block (`tool_call` returning `{ block: true }`) with a soft nudge appended to the bash `tool_result`.
- The nudge is informational only — the bash command runs, and the agent sees a suggestion to consider LSP for semantic queries.
- Remove the `tool_call` handler for bash semantic blocking.
- Remove the `shouldBlockSemanticBashSearch` function from `bash-guard.ts`.
- Add a `shouldSuggestLsp` function that returns a nudge message when conditions are met (semantic prompt + text search command + LSP-supported targets).
- Gate the nudge on target files being LSP-supported (`.md`/`.json` searches never get nudged).

## Capabilities

### New Capabilities

- `bash-guard-soft-nudge`: Informational LSP suggestion appended to bash tool results for semantic text-search commands targeting LSP-supported files.

### Modified Capabilities

- `lsp-tool-guidance`: Bash search steering moves from hard block to soft nudge via `tool_result`.

## Impact

- `packages/supi-lsp/bash-guard.ts` — replace `shouldBlockSemanticBashSearch` with `shouldSuggestLsp`; add `extractSearchTargets` for file-type gating.
- `packages/supi-lsp/lsp.ts` — move bash steering from `tool_call` handler to `tool_result` handler; remove block logic.
- `packages/supi-lsp/__tests__/guardrails.test.ts` — update tests from blocking assertions to nudge assertions; add unsupported-file-type passthrough tests.
