# supi-review

Session-aware code review via managed in-process child sessions.

## Commands

```bash
pnpm vitest run packages/supi-review/
pnpm exec tsc --noEmit -p packages/supi-review/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-review/__tests__/tsconfig.json
pnpm exec biome check packages/supi-review/
```

## Architecture

The `/supi-review` command follows a **history-aware** pipeline:

1. **Select target** — working tree, branch diff, or commit
2. **Select model** — explicit every run from Pi's scoped model set; current session model is preselected only when it is scoped
3. **Collect optional note** — user can steer the generated brief
4. **Resolve snapshot** — concrete changed files + diff/show text
5. **Collect session evidence** — from the active branch's resolved LLM-visible context
6. **Synthesize brief** — child session turns history + snapshot metadata into a structured brief
7. **Build review packet** — combine brief + snapshot into the final reviewer prompt
8. **Preview and confirm** — show the synthesized brief and prompt coverage
9. **Run reviewer** — read-only child session inspects the code and submits findings
10. **Render results** — synthesized brief context + verdict + findings
11. **Main-agent handoff** — if findings exist, inject a hidden follow-up instruction so the main agent asks the user what to do next

### Core types

- `ReviewTargetSpec` — selected git target (`working-tree` | `branch` | `commit`)
- `ReviewSnapshot` — fully resolved git snapshot (title, changed files, diff text, stats)
- `HistoryEvidence` — scored evidence extracted from the active session branch
- `SynthesizedReviewBrief` — structured intent inferred from the current session
- `ReviewPacket` — final reviewer prompt plus included/omitted file coverage
- `ReviewPlan` — model + snapshot + synthesized brief + reviewer packet
- `ReviewResult` — success / failed / canceled / timeout result for the review run

### Package structure

```text
src/
  review.ts             Command registration + orchestration
  types.ts              ReviewSnapshot, SynthesizedReviewBrief, ReviewResult, etc.
  model.ts              Explicit model-selection helpers
  git.ts                Git diff/commit/branch helpers + snapshot resolution
  history/
    collect.ts          Active-branch evidence extraction and scoring
    synthesize.ts       Brief synthesis prompt builder + runner orchestration
  target/
    packet.ts           Reviewer prompt packet builder with file-aware diff packing
  tool/
    brief-runner.ts     Brief synthesis child session
    review-runner.ts    Read-only reviewer child session
    runner-types.ts     Shared runner progress/result types
    schemas.ts          TypeBox schemas for submit_review[_brief]
  ui/
    flow.ts             TUI selection + preview steps
    progress-widget.ts  Live progress widget for child sessions
    renderer.ts         Custom message rendering with brief context
    format-content.ts   Plain-text message content for LLM context
__tests__/
  unit/
```

## Key design decisions

- **No review settings surface** — no `/supi-settings` integration, no persisted review model
- **Model selection is mandatory per run** — the user chooses the model every time from Pi's scoped `enabledModels` set
- **No presets/depth UI** — the important input is the current session history, not a generic canned mode
- **No editable raw prompt step** — the user previews the synthesized brief, not a hand-edited prompt blob
- **Snapshot first** — review targets are fully resolved before synthesis/review starts; no lazy target hydration
- **Active branch only** — evidence extraction uses `buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId())` so compaction and branch-summary semantics match the actual LLM-visible context
- **Read-only review session** — reviewer tools are restricted to `read`, `grep`, `find`, `ls`, and `submit_review`
- **Minimal synthesis session** — brief synthesis uses only `submit_review_brief` and no context files/extensions/skills/themes

## Child-session design

### Brief synthesis session

- created with `createAgentSession()` + `SessionManager.inMemory()`
- tools: `submit_review_brief` only
- resource loader disables extensions, skills, prompt templates, themes, and context files
- output schema: summary, intendedOutcome, constraints, focusAreas, riskyFiles, unresolvedQuestions
- timeout returns `kind: "timeout"`; no graceful wrap-up phase

### Review session

- created with `createAgentSession()` + `SessionManager.inMemory()`
- tools: `read`, `grep`, `find`, `ls`, `submit_review`
- resource loader keeps project context files enabled so the reviewer inherits repo guidance
- live progress comes from `session.subscribe()` events (turns, tool activity, token stats)
- soft timeout steers the model to finish, then aborts after grace turns if needed

## Gotchas

- `ctx.sessionManager` in extension contexts is read-only; use `getBranch()` and derive any extra views yourself
- `custom_message` entries remain high-signal session evidence because they survive in the resolved session context as `custom` messages
- Compaction and branch summaries must be respected through the resolved session context; do not score raw pre-compaction entries directly
- `buildBriefSynthesisPrompt()` must include a bounded diff excerpt so the synthesizer can see actual code changes, not just filenames/stats
- `buildReviewPacket()` is file-aware and explicitly lists omitted files; avoid reintroducing whole-diff middle truncation
- Review results carry `snapshot`, `brief`, and `modelId`; renderers and plain-text formatting should use those instead of older prompt-centric metadata
- The visible `supi-review` custom message is followed by a hidden `supi-review-followup` custom message when findings exist; its content instructs the main agent to ask the user what to do next, preferably via `ask_user`
- Keep the final custom message content concise and structured: plain text in `content`, richer data in `details`
