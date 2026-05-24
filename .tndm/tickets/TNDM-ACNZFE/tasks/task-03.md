# Task 3: Re-home the LSP pi adapter and unified semantic UX in supi-code-intelligence

## Goal
Move the entire LSP-facing pi adapter into `packages/supi-code-intelligence` while keeping `packages/supi-lsp` as the runtime library.

## Changes
1. Add a new `packages/supi-code-intelligence/src/lsp/` domain for the semantic adapter.
   - `runtime-state.ts` should hold the umbrella package's in-memory semantic adapter state.
   - `session-lifecycle.ts` should consume the new `@mrclrchtr/supi-lsp/api` controller instead of reaching into substrate internals.
   - `tool-specs.ts`, `guidance.ts`, `register-tools.ts`, and `tool-actions.ts` should become the new owner of the public `lsp_*` tool metadata and execution wiring.
   - `diagnostic-injection.ts`, `tool-overrides.ts`, `settings.ts`, and `lsp-message-renderer.ts` should become the new owner of diagnostic injection, write/edit augmentation, settings registration, and custom message rendering.
2. Add a unified status surface in `packages/supi-code-intelligence/src/ui/`.
   - Create `code-intelligence-status-command.ts` and `code-intelligence-status-view.ts`.
   - Replace the old substrate-specific install-time UX with a single code-intelligence status entry point. Use a concrete command name in this task instead of carrying a placeholder.
3. Update `packages/supi-code-intelligence/src/code-intelligence.ts` so the extension wires the new LSP adapter modules during session start/shutdown and before-agent hooks.
4. Update `packages/supi-code-intelligence/package.json` so it no longer loads `node_modules/@mrclrchtr/supi-lsp/src/extension.ts` through `pi.extensions` once the local umbrella adapter exists.
5. Keep the old `packages/supi-lsp` extension files in place temporarily; the later cleanup task will delete them after the umbrella adapter is proven.

## Test plan
- Update `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` first so it fails until the package registers `lsp_*` tools and the unified UX hooks itself.
- Add dedicated unit coverage for the new LSP guidance, status command/view, settings registration, diagnostic injection, and tool overrides under the new exact test files listed above.
- Preserve the current `code_*` behavior while expanding the umbrella surface.
