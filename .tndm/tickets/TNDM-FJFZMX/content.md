## Design: Code-only surface cleanup

Follow-up from review of TNDM-A9AQF4. After removing `lsp_*`/`tree_sitter_*` from public registration, dead code remains, comments are stale, tests could be more explicit, and CLAUDE.md overstates some absorption claims.

### What changes

1. **Delete 8 dead modules** — `lsp/register-tools.ts`, `lsp/tool-specs.ts`, `lsp/guidance.ts`, `lsp/tool-actions.ts`, `tree-sitter/register-tools.ts`, `tree-sitter/tool-specs.ts`, `tree-sitter/guidance.ts`, `tree-sitter/tool-actions.ts`. All have zero external callers after TNDM-A9AQF4 removed their import sites from `code-intelligence.ts` and `session-lifecycle.ts`.

2. **Fix stale V2 workflow comments** — `surface.ts` still says `code_health.nonGoals` includes "Does not remove public lsp_* or tree_sitter_* tools in Phase 0" — this is now done. `names.ts` says "Phase 0 note: this is design metadata only" — update to Phase 1.5.

3. **Add explicit absent-tool assertions** — the registration test checks inactive V2 tools are absent but doesn't explicitly assert that specific `lsp_*`/`tree_sitter_*` names are absent. Add those assertions.

4. **Update CLAUDE.md** — fix the architecture diagram (remove "actions, specs, guidance" from the lsp/ and tree-sitter/ directory comments), and document the known absorption gaps:
   - `lsp_hover` is not currently replaced (type/signature info is lost)
   - `lsp_code_actions` is deferred to a future phase

### What stays

- `lsp/tool-overrides.ts` — still active (read/write/edit overrides)
- `lsp/diagnostic-injection.ts` — still active
- `lsp/runtime-state.ts` — still active
- `lsp/session-lifecycle.ts` — still active
- `lsp/settings.ts` — still active
- `lsp/workspace-recovery.ts` — still active
- `tree-sitter/session-lifecycle.ts` — still active
- The underlying LSP/tree-sitter libraries (`supi-lsp`, `supi-tree-sitter`) — unchanged

### Non-goals

- Do not add hover/type info to code_brief (separate feature)
- Do not implement code_inspect (deferred)
- Do not change any public tool schema or behavior
