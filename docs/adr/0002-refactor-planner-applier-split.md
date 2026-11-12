# Refactor planner/applier split with fingerprint-checked plans

**Context.** A refactor capability that computes and applies edits in a single step gives no review gate before files change, and a plan computed against an older file version, applied blindly, would corrupt code. The stack's evidence-strictness philosophy requires that mutation be separable from planning and that staleness be *detected*, not assumed away. This ADR records the invariant the `code_refactor_plan` / `code_refactor_apply` public surface is built on; it is the file `packages/supi-code-intelligence/README.md` references for the planner/applier invariant.

**Decision.** Split the refactor surface into two tools joined by a session-scoped plan handle.

- `code_refactor_plan` is a **pure planner**: it computes precise semantic edits for exactly one nested operation payload (`rename_symbol`, `code_action`, or `source_action`) and returns a `planId`. It never mutates files. Each operation carries its own scope. `rename_symbol` requires a **name anchor** (per ADR 0003) because LSP rename needs the identifier. `code_action` names a file range and `source_action` a whole file; both select server code actions by CodeActionKind prefix and optional exact title, and need no symbol target.
- `code_refactor_apply` is the **sole mutator**: it applies a previously stored plan by `planId`. It does not require a live semantic provider. The Workspace code-intelligence session checks stored SHA-256 file fingerprints (`isPlanFresh` in `src/session/refactor-plans.ts`) and revalidates edit ranges and overlap before writing. Stale plans are rejected with an explicit request to regenerate. No heuristic text fallback.
- Plans live in the Workspace code-intelligence session's in-memory map. `planId` is `plan-<12hex>` derived from operation, file, operation scope, and a time discriminator. Plans are removed after successful apply and are never persisted across sessions.

**The planner/applier invariant.** Planning and mutation are separate tools; the only path from a plan to the filesystem is `code_refactor_apply` with a fresh `planId`. `code_refactor_plan` has no write capability; `code_refactor_apply` has no planning capability. Application acquires PI's per-file mutation queues in sorted path order and rolls back already-written files if a later write fails (ADR 0006).

**Considered Options (rejected).**

- *Single combined refactor tool (compute + apply in one call):* no review gate; an agent or user cannot inspect proposed edits before files change, and a mis-targeted rename lands immediately.
- *Apply-during-plan with an opt-out flag:* same risk surface; flags are routinely ignored.
- *Persisting plans across sessions (e.g., via pi session entries):* premature; the fingerprint model already makes staleness explicit, and cross-session apply invites applying a plan against a file the user has since edited elsewhere. Session scope matches `targetId`.
- *Text-based apply without fingerprints (apply the stored `WorkspaceEdit` directly):* unsafe; edit ranges may no longer correspond to current file contents after any intervening edit, producing corrupted patches. Fingerprints are the honesty backstop.
- *Heuristic text fallback for rename (sed-style):* would rename shadowed names, strings, and comments; contradicts the symbol-identity discipline (see ADR 0003).

**Consequences.**

- Two-step UX: agents call `code_refactor_plan`, review the preview, then `code_refactor_apply` with the `planId`. This is intentional — it preserves a review checkpoint.
- `planId`s are session-scoped and expire on any fingerprint change to their touched files; re-applying a stale plan is a hard error, not a silent re-plan.
- Code and source actions require an LSP code action that returns precise text edits; absent that, `code_refactor_plan` returns `unavailable` / `ambiguous` honestly rather than approximating. Command-only actions stay unavailable because their edits cannot be previewed.
- `code_refactor_apply` remains text-edit-only in this phase; file/resource operations are out of scope until shared runtime support exists.
- `rename_symbol` cannot use a target that has only a declaration anchor; re-resolve to the identifier first.
- Code actions choose generated names (for example extracted variables). Planning previews the server's name; an exact requested name needs a follow-up `rename_symbol`.
