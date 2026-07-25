# supi-review

Session-aware code review via managed in-process child sessions.

The package exposes a human-driven `/supi-review` command plus the agent-facing `supi_review_prepare` → `supi_review_run` workflow.

The `/supi-review` command follows a **history-aware** pipeline:

1. **Select target** — working tree, branch diff, or commit
2. **Select model** — explicit every run from Pi's scoped model set; current session model is preselected only when it is scoped
3. **Collect optional note** — user can steer the generated brief
4. **Resolve snapshot** — concrete changed files + diff/show text
5. **Serialize session context** — compaction-style transcript of the active branch's resolved LLM-visible context
6. **Synthesize brief** — child session turns history + snapshot metadata into a structured brief
7. **Build review packet** — compact prompt with brief + file metadata + brief-selected mandatory review instructions; no bulk diffs; reviewer fetches diffs on demand
8. **Preview and confirm** — show the synthesized brief and compact prompt preview; `v` opens the in-app inspector (Overview first, Raw Prompt via `tab`, export via `e`)
9. **Run reviewer** — read-only child session inspects the code and submits structured review items
10. **Normalize + render results** — host derives the verdict, sorts review items, computes summary counts, and renders the result
11. **Main-agent handoff** — if review items exist, inject a hidden follow-up instruction so the main agent asks the user what to do next

The agent-facing tools follow a **prepare / critique / run** pipeline:

1. `supi_review_prepare` resolves the target, serializes active context, synthesizes a versioned brief, stores a session-scoped plan, and dynamically activates `supi_review_run`
2. the main agent evaluates the generated brief against the user request, session evidence, and snapshot
3. `supi_review_run` requires a structured Brief Critique; `revise` also requires at least one evidence-backed finding plus a full replacement brief
4. the host atomically consumes the plan, re-resolves and fingerprint-checks the snapshot, and runs 1–4 focused reviewer sessions concurrently
5. the host checks freshness again after review and returns normalized per-reviewer results plus a Brief Evaluation artifact

### Core types

- `ReviewTargetSpec` — selected git target (`working-tree` | `branch` | `commit`)
- `ReviewSnapshot` — fully resolved git snapshot (title, changed files, diff text, stats)
- `SynthesizedReviewBrief` — structured intent inferred from the current session
- `ReviewItem` — structured reviewer-submitted item (category/impact/effort/recommended action/fix guidance)
- `ReviewOutputEvent` — raw reviewer submission (`items`, `overall_explanation`, `overall_confidence_score`)
- `NormalizedReviewOutput` — host-owned review output with derived `overall_correctness` and summary counts
- `RawReviewResult` — raw child-session result before normalization
- `ReviewResult` — normalized success / failed / canceled / timeout result for the rendered review run
- `ReviewPacket` — compact reviewer prompt with brief + file manifest + mandatory review instructions; no inline diffs
- `ReviewPlan` — model + snapshot + synthesized brief + reviewer packet
- `BriefCritique` — main-agent accept/revise verdict with evidence-backed field findings
- `BriefEvaluation` — generated brief + critique + effective brief + prompt/model/snapshot provenance
- `ReviewerAssignment` — stable id + independent focus for one reviewer child session

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
    review-instruction-blocks.ts  Fixed host-owned review instruction block catalog
    packet.ts                     Compact review packet builder + shared preview-data derivation
  session/
    review-plan-store.ts   Session-scoped one-shot plans for agent-driven review
  tool/
    agent-review-tools.ts  Prepare/run registration, dynamic activation, progress + debug recording
    agent-review-workflow.ts  Preparation, critique validation, freshness checks + concurrent fan-out
    agent-review-schemas.ts   Agent-facing TypeBox schemas
    guidance.ts              Agent-facing prompt surfaces
    brief-runner.ts        Brief synthesis child session
    review-runner.ts       Read-only reviewer child session
    runner-helpers.ts      Shared runner helpers (extractLastAssistantText, etc.)
    runner-types.ts        Shared runner progress/result types
    schemas.ts             TypeBox schemas for submit_review[_brief]
    snapshot-tools.ts      Snapshot-aware diff/file tools for the reviewer session
  ui/
    flow.ts             TUI selection + review flow entry points
    review-tool-format.ts    Agent-tool model-visible brief/critique/result formatting
    review-tool-renderer.ts  Compact/expanded prepare + run tool rendering
    review-plan-inspector.ts
                         In-app summary/inspector preview with Overview + Raw Prompt modes
    renderer.ts         Custom message rendering with normalized review items
    format-content.ts   Plain-text message content for LLM context
    format-helpers.ts   Shared formatLevel/formatLocation utilities
    (ProgressWidget migrated to @mrclrchtr/supi-core/progress-widget;
     runWithProgressWidget lives in @mrclrchtr/supi-core/tool-framework)
__tests__/
  unit/
```

## Key design decisions

- **No review settings surface** — no `/supi-settings` integration, no persisted review model
- **Two-stage agent seam** — preparation and execution are separate tools so the main agent's Brief Critique is explicit and inspectable
- **Dynamic run-tool activation** — `supi_review_run` stays inactive until preparation succeeds, reducing initial prompt surface
- **Current model for agent runs** — tool-driven plans capture the current session model; command runs retain explicit user selection
- **One-shot freshness-checked plans** — prepared plans are session-local, claimed atomically, and checked before and after concurrent review
- **Evaluation provenance** — generated and effective briefs are retained separately with prompt version, model id, critique, and snapshot fingerprint
- **Model selection is mandatory per run** — the user chooses the model every time from Pi's scoped `enabledModels` set
- **No presets/depth UI** — the important input is the current session history, not a generic canned mode
- **No editable raw prompt step** — the user can inspect the raw prompt in-app, but not edit a prompt blob
- **In-app preview inspector** — full preview stays inside Pi; no external pager is required for the primary path
- **Snapshot first** — review targets are fully resolved before synthesis/review starts; no lazy target hydration
- **Active branch only** — session-context serialization uses `buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId())` so compaction and branch-summary semantics match the actual LLM-visible context
- **Read-only review session** — reviewer tools include `read`, `grep`, `find`, `ls`, `submit_review`, and snapshot-aware `read_snapshot_diff` / `read_snapshot_file` for on-demand inspection
- **Host-owned verdict** — the reviewer submits review items plus explanation/confidence; `src/review-result.ts` derives the final binary verdict from normalized `recommended_action` values
- **Brief-selected instruction blocks** — `src/target/review-instruction-blocks.ts` defines a fixed host-owned catalog, while the brief synthesizer selects the relevant block IDs for each run
- **Minimal synthesis session** — brief synthesis uses only `submit_review_brief` and no context files/extensions/skills/themes

## Review instruction block catalog

`src/target/review-instruction-blocks.ts` defines a fixed catalog of four review instruction blocks:

1. **Public-surface / rename / merge audit**
   - sweep source, tests, docs, user-facing strings, and debug/status lists for stale public names
2. **Cross-layer propagation audit**
   - verify provider/runtime/orchestration/presentation/test handoffs and look for at least one end-to-end expectation
3. **Enum / operation / schema widening audit**
   - audit validation, unavailable paths, aliases, switch coverage, and negative tests
4. **Cleanup / deletion / orphan audit**
   - audit orphan files, dead imports or re-exports, stale comments, and outdated expectations

The brief synthesizer chooses zero or more block IDs from this catalog and the packet builder renders them as mandatory review instructions. The host no longer infers block selection from snapshot heuristics.

## Child-session design

### Brief synthesis session

- created with `createAgentSession()` + `SessionManager.inMemory()`
- tools: `submit_review_brief` only
- resource loader disables extensions, skills, prompt templates, themes, and context files
- output schema: summary, intendedOutcome, constraints, focusAreas, riskyFiles, unresolvedQuestions, reviewInstructionBlockIds
- timeout returns `kind: "timeout"`; no graceful wrap-up phase

### Review session

- created with `createAgentSession()` + `SessionManager.inMemory()`
- tools: `read`, `grep`, `find`, `ls`, `submit_review`, `read_snapshot_diff`, `read_snapshot_file`
- resource loader disables extensions while keeping project context files enabled, so repo guidance is inherited without extension hooks or tool overrides weakening the read-only guarantee
- snapshot tools (`read_snapshot_diff`, `read_snapshot_file`) are scoped to the selected snapshot's changed-files list and are the primary way the reviewer inspects per-file diffs
- the prompt packet may include mandatory review instructions; reviewer instructions treat supplied instructions as required checks for that run
- live progress comes from `session.subscribe()` events (turns, tool activity, token stats)
- soft timeout steers the model to finish, then aborts after grace turns if needed

## Gotchas

- `ctx.sessionManager` in extension contexts is read-only; use `getBranch()` and derive any extra views yourself
- Managed child runners must finalize on `agent_settled`, not `agent_end`; Pi may still retry, compact and retry, or deliver queued steering after `agent_end`
- The session-context serializer operates on the resolved `buildSessionContext(...)` output, so `custom_message` entries, compaction summaries, and branch summaries all appear in the transcript exactly as the LLM would see them
- `buildBriefSynthesisPrompt()` must include a bounded diff excerpt so the synthesizer can see actual code changes, not just filenames/stats
- `buildReviewPacket()` stays compact: brief, manifest, overview, mandatory review instructions, and on-demand snapshot inspection instructions. Do not reintroduce bulk diff embedding.
- Full preview no longer shells out to `less`; export-to-temp-file is a debugging fallback only.
- `src/review-result.ts` is the single source of truth for verdict derivation, action/category summary counts, and review-item ordering
- Agent-driven review plans are in-memory and session-scoped; `/reload`, session replacement, or shutdown clears them
- `supi_review_run` must not share a tool batch with edit/write/mutating bash calls; pre/post fingerprints reject detected drift, but avoiding concurrent mutation keeps snapshot-tool reads coherent
- Agent commit targets accept only 7–64 character hexadecimal object ids, resolve object-only through `rev-parse --disambiguate`, reject ambiguous/non-commit objects via `cat-file`, and never fall back to hexadecimal ref names. Branch targets resolve only exact local `refs/heads/*` names. Git revision arguments use `--end-of-options` where supported.
- Branch snapshots consistently compare the merge base to `HEAD`; dirty working-tree changes belong only to the working-tree target.
- When changing the brief synthesis prompt contract, bump `BRIEF_SYNTHESIS_PROMPT_VERSION` so Brief Evaluation artifacts remain comparable
- Full Brief Evaluation data belongs in tool-result `details`; SuPi Debug receives a sanitized summary plus raw data only through its opt-in raw access path
- `ReviewResult` success payloads are normalized before rendering; renderers and plain-text formatting should use normalized review items instead of assuming raw reviewer output
- The visible `supi-review` custom message is followed by a hidden `supi-review-followup` custom message when review items exist; its content instructs the main agent to ask the user what to do next, preferably via `ask_user`, with the fixed options `Fix all`, `Fix selected`, `Verify findings`, `Skip`
- Keep the final custom message content concise and structured: plain text in `content`, richer data in `details`
