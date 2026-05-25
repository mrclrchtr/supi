Two bugs in the code-intelligence redesign (TNDM-S7K282):

1. `getDefaultWorkspaceRuntime()` uses a module-local `let` variable instead of `globalThis` + `Symbol.for`. In standalone installs where `supi-lsp` and `supi-code-intelligence` ship separate bundled copies of `@mrclrchtr/supi-code-runtime`, jiti loads two module instances — LSP registers capabilities into one, code-intelligence reads from another. Result: `code_*` tools always return "No code provider initialized" in standalone installs.

2. `unregisterTreeSitterCapabilities()` calls `runtime.clearWorkspace(cwd)` which deletes the entire workspace entry. On session restart, LSP's `session_start` fires first and registers semantic capabilities, then tree-sitter's `session_start` fires and wipes the whole workspace before re-registering structural. Result: after any session reload, `code_*` tools lose semantic access.

Fixes are independent and small. Follow `supi-core`'s existing `globalThis` + `Symbol.for` pattern for #1, and add capability-specific `clearStructural` to the runtime for #2.