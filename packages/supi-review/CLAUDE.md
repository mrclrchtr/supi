# supi-review

Session-aware code review via managed in-process child sessions.

The `/supi-review` command follows a **history-aware** pipeline:

1. **Select target** — working tree, branch diff, or commit
2. **Select model** — explicit every run from Pi's scoped model set; current session model is preselected only when it is scoped
3. **Collect optional note** — user can steer the generated brief
4. **Resolve snapshot** — concrete changed files + diff/show text
5. **Serialize session context** — compaction-style transcript of the active branch's resolved LLM-visible context
6. **Synthesize brief** — child session turns history + snapshot metadata into a structured brief
7. **Build review packet** — compact prompt with brief + file metadata + deterministic audit hints; no bulk diffs; reviewer fetches diffs on demand
8. **Preview and confirm** — show the synthesized brief and compact prompt preview
9. **Run reviewer** — read-only child session inspects the code and submits structured review items
10. **Normalize + render results** — host derives the verdict, sorts review items, computes summary counts, and renders the result
11. **Main-agent handoff** — if review items exist, inject a hidden follow-up instruction so the main agent asks the user what to do next

### Core types

- `ReviewTargetSpec` — selected git target (`working-tree` | `branch` | `commit`)
- `ReviewSnapshot` — fully resolved git snapshot (title, changed files, diff text, stats)
- `SynthesizedReviewBrief` — structured intent inferred from the current session
- `ReviewItem` — structured reviewer-submitted item (category/impact/effort/recommended action/fix guidance)
- `ReviewOutputEvent` — raw reviewer submission (`items`, `overall_explanation`, `overall_confidence_score`)
- `NormalizedReviewOutput` — host-owned review output with derived `overall_correctness` and summary counts
- `RawReviewResult` — raw child-session result before normalization
- `ReviewResult` — normalized success / failed / canceled / timeout result for the rendered review run
- `ReviewPacket` — compact reviewer prompt with brief + file manifest + audit hints; no inline diffs
- `ReviewPlan` — model + snapshot + synthesized brief + reviewer packet

### Package structure

```text
src/
  review.ts             Command registration + orchestration
  review-result.ts      Verdict derivation, item ordering, and summary counts
  types.ts              ReviewSnapshot, ReviewItem, RawReviewResult, ReviewResult, etc.
  model.ts              Explicit model-selection helpers
  git.ts                Git diff/commit/branch helpers + snapshot resolution
  history/
    collect.ts          Compaction-style session-context serialization
    synthesize.ts       Brief synthesis prompt builder + runner orchestration
  target/
    audit-hints.ts      Deterministic audit-hint derivation from snapshot shape/diff metadata
    packet.ts           Compact review packet builder (no inline diffs)
  tool/
    brief-runner.ts     Brief synthesis child session
    review-runner.ts    Read-only reviewer child session
    runner-types.ts     Shared runner progress/result types
    schemas.ts          TypeBox schemas for submit_review[_brief]
    snapshot-tools.ts   Snapshot-aware diff/file tools for the reviewer session
  ui/
    flow.ts             TUI selection + preview steps
    renderer.ts         Custom message rendering with normalized review items
    format-content.ts   Plain-text message content for LLM context
    (ProgressWidget migrated to @mrclrchtr/supi-core/progress-widget;
     runWithProgressWidget lives in @mrclrchtr/supi-core/tool-framework)
__tests__/
  unit/
```

## Key design decisions

- **No review settings surface** — no `/supi-settings` integration, no persisted review model
- **Model selection is mandatory per run** — the user chooses the model every time from Pi's scoped `enabledModels` set
- **No presets/depth UI** — the important input is the current session history, not a generic canned mode
- **No editable raw prompt step** — the user previews the synthesized brief, not a hand-edited prompt blob
- **Snapshot first** — review targets are fully resolved before synthesis/review starts; no lazy target hydration
- **Active branch only** — session-context serialization uses `buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId())` so compaction and branch-summary semantics match the actual LLM-visible context
- **Read-only review session** — reviewer tools include `read`, `grep`, `find`, `ls`, `submit_review`, and snapshot-aware `read_snapshot_diff` / `read_snapshot_file` for on-demand inspection
- **Host-owned verdict** — the reviewer submits review items plus explanation/confidence; `src/review-result.ts` derives the final binary verdict from normalized `recommended_action` values
- **Deterministic audit hints** — `src/target/audit-hints.ts` adds bounded, rule-based audits for high-risk change shapes instead of running a second reviewer pass
- **Minimal synthesis session** — brief synthesis uses only `submit_review_brief` and no context files/extensions/skills/themes

## Deterministic audit families

`src/target/audit-hints.ts` produces only four audit families:

1. **Public-surface / rename / merge audit**
   - sweep source, tests, docs, user-facing strings, and debug/status lists for stale public names
2. **Cross-layer propagation audit**
   - verify provider/runtime/orchestration/presentation/test handoffs and look for at least one end-to-end expectation
3. **Enum / operation / schema widening audit**
   - audit validation, unavailable paths, aliases, switch coverage, and negative tests
4. **Cleanup / deletion / orphan audit**
   - audit orphan files, dead imports or re-exports, stale comments, and outdated expectations

These hints are deterministic host guidance threaded through the compact packet. They are not a second model pass.

## Child-session design

### Brief synthesis session

- created with `createAgentSession()` + `SessionManager.inMemory()`
- tools: `submit_review_brief` only
- resource loader disables extensions, skills, prompt templates, themes, and context files
- output schema: summary, intendedOutcome, constraints, focusAreas, riskyFiles, unresolvedQuestions
- timeout returns `kind: "timeout"`; no graceful wrap-up phase

### Review session

- created with `createAgentSession()` + `SessionManager.inMemory()`
- tools: `read`, `grep`, `find`, `ls`, `submit_review`, `read_snapshot_diff`, `read_snapshot_file`
- resource loader keeps project context files enabled so the reviewer inherits repo guidance
- snapshot tools (`read_snapshot_diff`, `read_snapshot_file`) are scoped to the selected snapshot's changed-files list and are the primary way the reviewer inspects per-file diffs
- the prompt packet may include audit hints; reviewer instructions treat supplied audit hints as mandatory checks for that run
- live progress comes from `session.subscribe()` events (turns, tool activity, token stats)
- soft timeout steers the model to finish, then aborts after grace turns if needed

## Gotchas

- `ctx.sessionManager` in extension contexts is read-only; use `getBranch()` and derive any extra views yourself
- The session-context serializer operates on the resolved `buildSessionContext(...)` output, so `custom_message` entries, compaction summaries, and branch summaries all appear in the transcript exactly as the LLM would see them
- `buildBriefSynthesisPrompt()` must include a bounded diff excerpt so the synthesizer can see actual code changes, not just filenames/stats
- `buildReviewPacket()` stays compact: brief, manifest, overview, audit hints, and on-demand snapshot inspection instructions. Do not reintroduce bulk diff embedding.
- `src/review-result.ts` is the single source of truth for verdict derivation, action/category summary counts, and review-item ordering
- `ReviewResult` success payloads are normalized before rendering; renderers and plain-text formatting should use normalized review items instead of assuming raw reviewer output
- The visible `supi-review` custom message is followed by a hidden `supi-review-followup` custom message when review items exist; its content instructs the main agent to ask the user what to do next, preferably via `ask_user`, with the fixed options `Fix all`, `Fix selected`, `Verify findings`, `Skip`
- Keep the final custom message content concise and structured: plain text in `content`, richer data in `details`
