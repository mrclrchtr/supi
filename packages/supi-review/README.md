<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-review">
    <picture>
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-review/assets/logo.png" alt="SuPi" width="50%">
    </picture>
  </a>
</div>

# @mrclrchtr/supi-review

Adds an interactive `/supi-review` command to the [pi coding agent](https://github.com/earendil-works/pi) for session-aware code review.

## Install

```bash
pi install npm:@mrclrchtr/supi-review
```

This is a **beta** package. Install individually.

For local development:

```bash
pi install ./packages/supi-review
```

## What you get

After install, pi gets one command:

- `/supi-review` — launch a guided review flow over a concrete git snapshot

The reviewer runs in managed child agent sessions:

- a **brief synthesizer** creates a structured review brief from the active session branch
- a **read-only reviewer** inspects the selected snapshot (without receiving bulk inline diffs) and submits structured review items

![Review target selection](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-review-1.png)

![Review brief preview](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-review-2.png)

![Review result](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-review-3.png)

![Review progress](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-review-4.png)

## Review flow

`/supi-review` walks you through:

1. choose a review target
2. choose the reviewer model
3. optionally add a short note
4. resolve the snapshot
5. synthesize a review brief from the current session history
6. preview the synthesized brief + compact prompt preview, then press `v` for an in-app inspector (Overview first, Raw Prompt via `tab`, export via `e`)
7. the reviewer fetches per-file diffs on demand via snapshot-aware tools; live progress widget shows activity
8. normalize the submitted review items into a host-derived verdict + structured result
9. if review items exist, hand off to the main agent so it can ask what to do next with fixed options (`Fix all`, `Fix selected`, `Verify findings`, `Skip`)

## Review targets

Current targets:

- working tree
- branch diff vs a selected local base branch
- one recent commit

## Session-aware brief synthesis

The generated review prompt is **not** just a static diff wrapper.

Before the actual review starts, the package:

- resolves the **active session branch into the current LLM-visible context**
- **serializes** that resolved context into a compaction-style transcript
- feeds the serialized transcript (plus snapshot + optional note) to a dedicated brief synthesizer
- synthesizes a structured brief with:
  - summary
  - intended outcome
  - constraints to preserve
  - focus areas
  - risky files
  - unresolved questions

The synthesizer also receives a bounded diff excerpt from the snapshot so it can reason about actual code changes, not just filenames.

That synthesized brief is then combined with the git snapshot into a compact reviewer prompt. The prompt contains the brief, file manifest, per-file overview, and deterministic **audit hints** for certain change shapes, but no large inline diffs. Instead, the reviewer session gets snapshot-aware tools (`read_snapshot_diff`, `read_snapshot_file`) to fetch exact per-file diffs and before/after file contents on demand.

The session-transcript approach mirrors how Pi summarizes context for compaction: the entire resolved conversation is rendered in a readable label format and sent to the model as a whole, rather than relying on heuristic excerpt ranking.

## Review-plan inspector

Before the reviewer runs, the plan preview stays inside Pi:

- `v` opens an in-app inspector instead of spawning an external pager
- the inspector opens in **Overview** mode first
- `tab` toggles between **Overview** and **Raw Prompt**
- `↑↓` or `j` / `k` scroll long content in the inspector
- `q` or `esc` returns to the summary preview without canceling the review
- `e` exports the raw prompt to a temp file as a debugging fallback

The Overview mode uses the same structured packet data that feeds the reviewer prompt: audit hints, file overview rows, and truncated snapshot notes all come from shared packet derivation rather than re-parsing the raw prompt text.

## Model selection

Every `/supi-review` run asks you to choose the reviewer model.

- the picker only shows **scoped models** from Pi's `enabledModels` configuration
- the current session model is preselected only when it is inside that scoped set
- the selected model is used for both brief synthesis and the final review
- no review model is persisted in settings

## Result shape

A successful review includes:

- a host-derived binary verdict:
  - `PATCH IS CORRECT`
  - `PATCH HAS ISSUES`
- overall explanation
- overall confidence score
- normalized action/category summary counts
- structured review items with:
  - title
  - body
  - category
  - impact
  - effort
  - recommended action
  - confidence score
  - suggested fix
  - verification hint
  - optional code location
- the synthesized brief that drove the review

The renderer also handles failed, canceled, and timed-out reviews.

The reviewer model does **not** decide the final binary verdict directly. It submits review items plus overall explanation/confidence, then the host derives the verdict from the normalized items (`must-fix` items => `PATCH HAS ISSUES`).

When a successful review contains review items, `supi-review` also injects an agent-visible hidden follow-up message that asks the main agent to decide the next step with the user. If `ask_user` is available, the main agent is instructed to use it and offer:

- Fix all
- Fix selected
- Verify findings
- Skip

## Source

- `src/review.ts` — command orchestration and interactive flow
- `src/model.ts` — explicit model selection helpers
- `src/git.ts` — git snapshot resolution
- `src/history/collect.ts` — compaction-style session-context serialization
- `src/history/synthesize.ts` — brief synthesis orchestration
- `src/review-result.ts` — review-item normalization, verdict derivation, and summary counts
- `src/target/audit-hints.ts` — deterministic audit-hint derivation from snapshot shape
- `src/target/packet.ts` — final reviewer packet builder + shared preview-data derivation for the inspector
- `src/tool/brief-runner.ts` — brief synthesis child session
- `src/tool/review-runner.ts` — read-only reviewer child session with snapshot-aware tools
- `src/tool/snapshot-tools.ts` — per-file diff and before/after content tools scoped to the selected snapshot
- `src/ui/review-plan-inspector.ts` — in-app summary/inspector preview with Overview + Raw Prompt modes and export fallback
- `src/ui/renderer.ts` — structured result rendering
