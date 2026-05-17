## Brainstorming Outcome
**Problem**: `packages/supi-review` needs a redesign so reviews are more adaptable and feel less disconnected from the main session.

**Recommended approach**: Redesign `/supi-review` around a unified, user-approved **review brief** pipeline. Both review styles feed the same execution backend:
- **standard reviews** = predefined brief profiles
- **dynamic reviews** = a drafted brief built from structured user input, then edited/approved before the reviewer runs

**Why**: A single brief-driven pipeline solves the top priority (adaptability) while also making the execution feel more connected. The review request becomes explicit, inspectable, and tied to the final result instead of feeling like a detached sub-agent run.

**Key UX decisions**:
- Invocation stays **command-first** via `/supi-review`
- Dynamic flow is **agent-drafted / user-approved** before execution
- Dynamic brief input should capture:
  - a summary of what happened / what changed
  - the intended outcome of the change
  - what the reviewer should focus on
- The approved brief should be visible in the execution and result experience

**Recommended flow**:
```text
/supi-review
  ↓
select review mode
  - standard
  - dynamic
  ↓
select review target
  - uncommitted
  - base branch
  - commit
  ↓
build review brief
  - standard: from a predefined profile
  - dynamic: from summary + intent + review focus
  ↓
show/edit/approve brief
  ↓
run child reviewer
  ↓
render results with brief + target context
```

**Architecture direction**:
- Introduce a first-class `ReviewBrief` model that represents the review request independently from the git target.
- Keep one reviewer runner; pass the final approved brief into the child session prompt.
- Treat standard reviews as named profiles, not a separate execution engine.
- Update result rendering so the message reflects the requested brief/target context, not just the findings.

**Likely file responsibilities**:
- `src/review.ts` — command orchestration for mode/target/brief approval
- `src/ui.ts` — TUI steps for mode/profile selection, structured dynamic inputs, and brief approval
- `src/briefs.ts` or similar — canonical review brief model + prompt assembly
- `src/profiles.ts` — standard review presets
- `src/runner.ts` — child-session execution with approved brief
- `src/renderer.ts` / `src/format-content.ts` — render request + result together
- `src/types.ts` — review mode / brief / result metadata

**Constraints / non-goals**:
- Keep `/supi-review` as the primary entry point
- No multi-reviewer orchestration
- No chained review/fix/re-review loop redesign
- No profile authoring UI in the first pass
- Do not overbuild chat-history inference; use explicit structured inputs for dynamic review

**Open implementation assumption**:
- Ship a **small fixed starter set** of standard review profiles on the same pipeline; profile count and wording can stay minimal in the first pass.

**Ticket**: TNDM-0DGSCD