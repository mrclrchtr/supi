## Context

When a new TypeScript file is created via the `write` or `edit` tool, the LSP diagnostics can lag behind. The editor/LS client continues reporting `Cannot find module '../src/new-file.ts'` even though the file exists on disk and subsequent tests pass.

This was observed during the implementation of:
- `packages/supi-code-intelligence/src/git-context.ts`
- `packages/supi-code-intelligence/src/actions/index-action.ts`

For 1-2 agent turns after creation, red error diagnostics appeared at the top of the context, requiring mental filtering.

## Goal

Investigate whether the LSP integration in pi can trigger a workspace/diagnostic refresh or invalidate stale diagnostics when a file is created that resolves an import error.

## Acceptance

- [ ] Diagnose whether the issue is in pi's LSP client, the language server itself, or expected behavior
- [ ] If fixable in pi/supi-lsp: implement diagnostic refresh on file creation
- [ ] If not fixable: document the behavior as expected

## Verification (challenge the value)

Before marking done: quantify the impact. Does this affect only the agent (which can ignore diagnostics) or does it mislead users? If the agent correctly handles stale diagnostics and tests pass regardless, this may be cosmetic and not worth engineering effort. Close as wontfix if the cost exceeds the benefit.
