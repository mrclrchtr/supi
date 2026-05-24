# @mrclrchtr/supi-review

Adds an interactive `/supi-review` command to the [pi coding agent](https://github.com/earendil-works/pi) for session-aware code review.

## Install

```bash
pi install npm:@mrclrchtr/supi-review
```

This is a **beta** package. It is not bundled in `@mrclrchtr/supi`.

For local development:

```bash
pi install ./packages/supi-review
```

After editing the source, run `/reload`.

## What you get

After install, pi gets one command:

- `/supi-review` — launch a guided review flow over a concrete git snapshot

The reviewer runs in managed child agent sessions:

- a **brief synthesizer** creates a structured review brief from the active session branch
- a **read-only reviewer** inspects the selected snapshot and submits structured findings

## Review flow

`/supi-review` walks you through:

1. choose a review target
2. choose the reviewer model
3. optionally add a short note
4. resolve the snapshot
5. synthesize a review brief from the current session history
6. preview the synthesized brief + prompt coverage
7. run the review with a live progress widget
8. show the structured result as a custom message
9. if findings exist, hand off to the main agent so it can ask what to do next

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

That synthesized brief is then combined with the git snapshot into the final reviewer prompt.

The session-transcript approach mirrors how Pi summarizes context for compaction: the entire resolved conversation is rendered in a readable label format and sent to the model as a whole, rather than relying on heuristic excerpt ranking.

## Model selection

Every `/supi-review` run asks you to choose the reviewer model.

- the picker only shows **scoped models** from Pi's `enabledModels` configuration
- the current session model is preselected only when it is inside that scoped set
- the selected model is used for both brief synthesis and the final review
- no review model is persisted in settings

## Result shape

A successful review includes:

- overall correctness verdict
- overall explanation
- overall confidence score
- structured findings with title, body, priority, confidence score, and code location
- the synthesized brief that drove the review

The renderer also handles failed, canceled, and timed-out reviews.

When a successful review contains findings, `supi-review` also injects an agent-visible hidden follow-up message that asks the main agent to decide the next step with the user. If `ask_user` is available, the main agent is instructed to use it and offer:

- Done
- Fix all
- Fix selected
- Verify findings

## Source

- `src/review.ts` — command orchestration and interactive flow
- `src/model.ts` — explicit model selection helpers
- `src/git.ts` — git snapshot resolution
- `src/history/collect.ts` — compaction-style session-context serialization
- `src/history/synthesize.ts` — brief synthesis orchestration
- `src/target/packet.ts` — final reviewer packet builder
- `src/tool/brief-runner.ts` — brief synthesis child session
- `src/tool/review-runner.ts` — read-only reviewer child session
- `src/ui/renderer.ts` — structured result rendering
