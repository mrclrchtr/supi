<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-review">
    <picture>
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-review/assets/logo.png" alt="SuPi" width="50%">
    </picture>
  </a>
</div>

# @mrclrchtr/supi-review

Adds human-driven and agent-driven Session-Aware Review workflows to the [pi coding agent](https://github.com/earendil-works/pi).

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

After install, pi gets one human-driven command and two agent-facing tools:

- `/supi-review` — launch a guided review flow over a concrete git snapshot
- `supi_review_prepare` — synthesize a versioned brief and return a session-scoped `planId`
- `supi_review_run` — accept the main agent's structured brief critique, freshness-check the plan, and run focused reviewers concurrently

The run tool is initially inactive and is dynamically enabled after `supi_review_prepare` returns a plan. This keeps the initial agent-facing prompt surface small.

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

## Agent-driven review flow

The agent-facing path deliberately separates preparation from execution:

1. `supi_review_prepare` resolves the target, serializes the active session context, and synthesizes a generated brief.
2. The main agent compares that brief with the user request, session evidence, and snapshot.
3. The main agent calls `supi_review_run` with:
   - the prepared `planId`
   - an `accept` or `revise` critique
   - evidence-backed critique findings
   - at least one evidence-backed finding and a full `revisedBrief` when revision is required
   - one to four independent reviewer assignments
4. The host atomically consumes the plan, checks snapshot freshness, and runs reviewer child sessions concurrently.
5. The tool returns each normalized review result plus a retained brief evaluation artifact.

The evaluation artifact keeps the generated brief, main-agent critique, effective brief, synthesis prompt version, model id, and snapshot fingerprint separate. This makes brief-synthesis prompt regressions inspectable instead of hiding main-agent repairs. The full artifact is stored in tool-result `details`; a summary is also recorded as a `supi-review/brief-critique` SuPi Debug event when debug capture is enabled.

Prepared plans are session-scoped. File or git changes before or during review invalidate the run, so `supi_review_run` should not share a tool batch with mutating tools.

## Review targets

Current targets:

- working tree
- branch diff vs a selected local base branch (`merge-base..HEAD`, excluding dirty worktree changes)
- one commit (recent-commit picker in the command; hexadecimal object id in the agent tool)

Agent-provided branch targets must name an existing local branch. Commit targets must be unique 7–64 character hexadecimal commit-object ids: object-only disambiguation rejects ambiguous prefixes, non-commit objects, and hexadecimal branch/tag fallback. Git revision arguments are option-hardened before execution.

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
  - `reviewInstructionBlockIds` selected from a fixed host-owned catalog

The synthesizer also receives a bounded diff excerpt from the snapshot so it can reason about actual code changes, not just filenames.

That synthesized brief is then combined with the git snapshot into a compact reviewer prompt. The host owns a fixed catalog of review instruction blocks, and the brief selects zero or more block IDs from that catalog when extra review guidance is warranted. The resulting prompt contains the brief, file manifest, per-file overview, and any brief-selected **mandatory review instructions**, but no large inline diffs. Instead, the reviewer session gets snapshot-aware tools (`read_snapshot_diff`, `read_snapshot_file`) to fetch exact per-file diffs and before/after file contents on demand.

The session-transcript approach mirrors how Pi summarizes context for compaction: the entire resolved conversation is rendered in a readable label format and sent to the model as a whole, rather than relying on heuristic excerpt ranking.

## Review-plan inspector

Before the reviewer runs, the plan preview stays inside Pi:

- `v` opens an in-app inspector instead of spawning an external pager
- the inspector opens in **Overview** mode first
- `tab` toggles between **Overview** and **Raw Prompt**
- `↑↓` or `j` / `k` scroll long content in the inspector
- `q` or `esc` returns to the summary preview without canceling the review
- `e` exports the raw prompt to a temp file as a debugging fallback

The Overview mode uses the same structured packet data that feeds the reviewer prompt: mandatory review instructions, file overview rows, and truncated snapshot notes all come from shared packet derivation rather than re-parsing the raw prompt text.

## Model selection

Every `/supi-review` command run asks you to choose the reviewer model.

- the picker only shows **scoped models** from Pi's `enabledModels` configuration
- the current session model is preselected only when it is inside that scoped set
- the selected model is used for both brief synthesis and the final review
- the command selection is not persisted

Agent-driven tool runs use the **Review → Agent tool model** setting in `/supi-settings` when `@mrclrchtr/supi-settings` is installed:

- `current session model` is the default and preserves the active-session behavior
- an explicit choice stores a canonical `provider/model-id` from Pi's scoped `enabledModels` set
- the configured model is used for brief synthesis and every focused reviewer
- project settings override global settings through the normal SuPi settings scopes
- a configured model that is no longer scoped or available causes preparation to fail with a corrective error

The resolved model is retained in the prepared plan, so changing the setting or active session model between tool calls cannot silently alter the run.

For a standalone `supi-review` install without `supi-settings`, set the same value directly in the global `~/.pi/agent/supi/config.json` or project `.pi/supi/config.json` file:

```json
{
  "review": {
    "agentModel": "openai/gpt-5"
  }
}
```

Use `"current"` instead of a canonical model id to follow the active session model.

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
- `src/config.ts` — persisted agent-tool model setting and `/supi-settings` registration
- `src/model.ts` — explicit and configured model selection helpers
- `src/git.ts` — git snapshot resolution
- `src/history/collect.ts` — compaction-style session-context serialization
- `src/history/synthesize.ts` — brief synthesis orchestration
- `src/review-result.ts` — review-item normalization, verdict derivation, and summary counts
- `src/target/review-instruction-blocks.ts` — fixed catalog of host-owned review instruction blocks
- `src/target/packet.ts` — final reviewer packet builder + shared preview-data derivation for the inspector
- `src/session/review-plan-store.ts` — session-scoped, one-shot prepared review plans
- `src/tool/agent-review-tools.ts` — prepare/run tool registration, dynamic activation, progress, and debug artifact recording
- `src/tool/agent-review-workflow.ts` — preparation, critique validation, freshness checks, and concurrent reviewer fan-out
- `src/tool/brief-runner.ts` — brief synthesis child session
- `src/tool/review-runner.ts` — read-only reviewer child session with snapshot-aware tools
- `src/tool/snapshot-tools.ts` — per-file diff and before/after content tools scoped to the selected snapshot
- `src/ui/review-plan-inspector.ts` — in-app summary/inspector preview with Overview + Raw Prompt modes and export fallback
- `src/ui/renderer.ts` — structured result rendering
