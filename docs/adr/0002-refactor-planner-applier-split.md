# Refactor planner/applier split with fingerprint-checked plans

**Context.** A refactor capability that computes and applies edits in a single step gives no review gate before files change, and a plan computed against an older file version, applied blindly, would corrupt code. The stack's evidence-strictness philosophy requires that mutation be separable from planning and that staleness be *detected*, not assumed away. This ADR records the invariant the `code_refactor_plan` / `code_refactor_apply` public surface is built on; it is the file `packages/supi-code-intelligence/README.md` references for the planner/applier invariant.

**Decision.** Split the refactor surface into two tools joined by a session-scoped plan handle.

- `code_refactor_plan` is a **pure planner**: it computes precise semantic edits (`rename_symbol`, `extract_function`, `extract_variable`) via the semantic provider's `refactor` / `rename` entrypoints and returns a `planId`. It never mutates files. It requires a **name anchor** (per ADR 0003) — LSP `rename` needs the identifier; a declaration anchor is refused with an observable note.
- `code_refactor_apply` is the **sole mutator**: it applies a previously stored plan by `planId`. It does not require a live semantic provider — validity is enforced by comparing stored SHA-256 file fingerprints to current contents (`isPlanFresh` in `src/analysis/refactor/plan-store.ts`) and by re-validating edit ranges/overlap before writing. Stale plans (any fingerprint mismatch) are rejected with an explicit message to regenerate via `code_refactor_plan`. No heuristic text fallback.
- Plans live in an in-memory, session-scoped map (`src/analysis/refactor/plan-store.ts`). `planId` is `plan-<12hex>` derived from operation + target coordinates + a `Date.now()` discriminator. Plans are removed after successful apply. No cross-session persistence — `planId` mirrors the `targetId` lifecycle (session-scoped, fingerprint-checked).

**The planner/applier invariant.** Planning and mutation are separate tools; the only path from a plan to the filesystem is `code_refactor_apply` with a fresh `planId`. `code_refactor_plan` has no write capability; `code_refactor_apply` has no planning capability.

**Considered Options (rejected).**

- *Single combined refactor tool (compute + apply in one call):* no review gate; an agent or user cannot inspect proposed edits before files change, and a mis-targeted rename lands immediately.
- *Apply-during-plan with an opt-out flag:* same risk surface; flags are routinely ignored.
- *Persisting plans across sessions (e.g., via pi session entries):* premature; the fingerprint model already makes staleness explicit, and cross-session apply invites applying a plan against a file the user has since edited elsewhere. Session scope matches `targetId`.
- *Text-based apply without fingerprints (apply the stored `WorkspaceEdit` directly):* unsafe; edit ranges may no longer correspond to current file contents after any intervening edit, producing corrupted patches. Fingerprints are the honesty backstop.
- *Heuristic text fallback for rename (sed-style):* would rename shadowed names, strings, and comments; contradicts the symbol-identity discipline (see ADR 0003).

**Consequences.**

- Two-step UX: agents call `code_refactor_plan`, review the preview, then `code_refactor_apply` with the `planId`. This is intentional — it preserves a review checkpoint.
- `planId`s are session-scoped and expire on any fingerprint change to their touched files; re-applying a stale plan is a hard error, not a silent re-plan.
- Extract operations require an LSP code action that returns precise text edits; absent that, `code_refactor_plan` returns `unavailable` / `ambiguous` honestly rather than approximating.
- `code_refactor_apply` remains text-edit-only in this phase; file/resource operations are out of scope until shared runtime support exists.
- `code_refactor_plan`'s name-anchor requirement (ADR 0003) means a target resolved only to a declaration anchor cannot be renamed — re-resolve to the identifier first.
