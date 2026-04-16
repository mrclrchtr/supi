## Context

SuPi is already a pi package with multiple TypeScript extensions loaded directly at runtime, and pi's documented extension APIs provide the exact primitives needed for an in-run user-input tool: `pi.registerTool()` for the model-facing surface, `promptSnippet` / `promptGuidelines` for agent steering, `ctx.ui.custom()` for rich TUI overlays, `ctx.ui.select()` / `ctx.ui.input()` for fallback dialogs, and `renderCall` / `renderResult` for transcript-friendly rendering. The repo also already contains adjacent reference patterns: pi's example `question.ts` and `questionnaire.ts` demonstrate custom question tools and bounded questionnaire flows, while external implementations like `pi-ask-user` and `oh-my-pi` show richer decision UX and multi-question state handling.

The change needs more than a thin wrapper around `ctx.ui.select()`. The approved direction is a decision-first `ask_user` tool that can ask one to four typed questions, preserve structured answers for the model and transcript, and degrade safely when the richer overlay UI is unavailable. The implementation also needs to stay idiomatic to this repo: small focused modules, direct TypeScript loading, minimal runtime dependencies, and tests that exercise normalization and user-flow behavior. Pi's RPC docs also matter here: `ctx.hasUI` remains true in RPC mode, `ctx.ui.custom()` returns `undefined`, and dialog methods such as `select`, `confirm`, and `input` still function through the extension UI protocol.

## Goals / Non-Goals

**Goals:**
- Register a single `ask_user` tool that the model can call for focused clarifications and decisions during an agent run
- Support bounded questionnaires with typed questions: `choice`, `text`, and `yesno`
- Provide richer decision support for structured questions via recommendations, optional `Other`, and optional follow-up comments
- Offer a rich overlay UI in interactive TUI sessions and a clean dialog/input fallback path when overlay interaction is unavailable
- Return hybrid tool results: concise continuation-friendly `content` plus structured `details` for rendering and future state reconstruction
- Keep the implementation modular and testable so the schema, flow controller, and UI layers can evolve independently

**Non-Goals:**
- Building a general long-form survey engine or arbitrary form builder
- Adding a separate permission-approval system for built-in tools in this change
- Supporting unlimited questions, unlimited options, or deeply nested branching questionnaires
- Introducing heavy external UI/runtime dependencies or a build step
- Reproducing every feature from `pi-ask-user` or `oh-my-pi`; this is a focused SuPi-native implementation
- Supporting multiple active questionnaires at once; v1 allows only one in-flight `ask_user` interaction per session

## Decisions

### 1. Register one `ask_user` tool with a bounded questionnaire schema

**Decision**: Expose a single `ask_user` tool that accepts `questions: Question[]`, where `Question` is a discriminated union of `choice`, `text`, and `yesno`, with a hard cap of 1–4 questions. In v1, the tool does not accept a timeout parameter and waits until the user submits, dismisses, or the execution signal is aborted.

**Rationale**: One tool keeps the model surface small and easy to learn, while a typed question union preserves clarity and deterministic parsing. Omitting timeout from the contract keeps user patience out of model control and avoids introducing a second failure state that often cannot help the agent proceed safely anyway. The 1–4 question bound matches the approved decision-oriented scope and prevents the tool from drifting into survey territory.

**Alternatives considered**:
- **Separate tools per question type**: rejected because it fragments the model-facing surface and makes multi-question flows awkward.
- **A loose single-question schema only**: rejected because richer decision flows are a core requirement for this change.
- **An untyped “questions + optional fields” blob**: rejected because it invites ambiguous model output and brittle validation.

### 2. Normalize all questions into one internal questionnaire model before UI rendering

**Decision**: Add a normalization layer that validates IDs, header lengths, question counts, choice option counts, and recommendation targets, and that treats `text` questions as accepting any non-empty string in v1. The normalizer then converts all question types into a shared internal questionnaire representation used by both overlay and fallback UIs. The flow controller also owns terminal-state transitions for user dismissal, `signal.aborted`, and successful submission, and enforces a single-active-questionnaire guard for the session.

**Rationale**: Validation and normalization should not be coupled to any one UI path. A single internal model lets the overlay renderer, dialog fallback, result formatter, and tests all operate on the same semantics. Putting cancellation, abort, and concurrency control into the shared flow layer prevents overlay/fallback drift and keeps the session-level rule of “one questionnaire at a time” explicit.

**Alternatives considered**:
- **Let each UI path parse raw tool params independently**: rejected because behavior would drift between overlay and fallback modes.
- **Treat `yesno` as a completely separate flow**: rejected because it is semantically just a constrained structured choice and fits cleanly in the shared model.

### 3. Keep recommendations as metadata, not user-visible label mutations

**Decision**: Store recommendation state explicitly in normalized question metadata and render it visually as selection guidance, ordering, or badges in the UI, rather than requiring the model to suffix option labels manually.

**Rationale**: Codex-style recommendation-first flows are useful, but encoding recommendations inside option labels leaks presentation concerns into the tool contract and makes answer parsing less reliable. First-class metadata gives cleaner validation and more flexible rendering.

**Alternatives considered**:
- **Require the model to append `(Recommended)` to labels**: rejected because it is brittle and mixes semantics with display text.
- **Ignore recommendation support in v1**: rejected because recommendations are part of the approved richer decision UX.

### 4. Support `Other` and comments only for structured selection questions

**Decision**: Allow `Other` and optional comments/notes on `choice` and `yesno` questions, but not on `text` questions.

**Rationale**: `text` questions are already freeform by nature, so layering `Other` or an extra comment field on top adds redundancy and UI complexity without improving decision quality. Structured questions benefit from an escape hatch (`Other`) and optional explanatory notes when preset choices are insufficient.

**Alternatives considered**:
- **Allow comments on every question type**: rejected because it creates redundant inputs for text questions and complicates both normalization and transcript summaries.
- **Restrict comments to `choice` only**: rejected because yes/no decisions can also benefit from brief rationale in high-impact cases.

### 5. Use overlay UI first, with dialog/input fallback as a first-class secondary path

**Decision**: Build a UI adapter with two implementations: a rich overlay questionnaire for interactive TUI sessions via `ctx.ui.custom()`, and a fallback path that uses pi dialog primitives when the overlay experience is unavailable or unsupported. The fallback path uses `ctx.ui.select()` for both `choice` and `yesno` questions, `ctx.ui.input()` for `text` questions, and `ctx.ui.select()` (Yes-add-a-note / No-skip) for the optional comment prompt on structured questions. Capability detection should check `ctx.hasUI` first, then attempt the rich path only when `ctx.ui.custom()` is available; in RPC mode, `custom()` returning `undefined` is the signal to fall back to dialogs. Back-navigation and final review are explicitly in scope for the rich multi-question flow in v1.

**Rationale**: `pi-ask-user` demonstrates that overlay UI produces the best experience for multi-question, context-rich decisions, but pi also exposes dialog APIs that work well in RPC or reduced-UI environments. Treating fallback as a deliberate second path, not an afterthought, keeps the tool usable across pi modes. `select()` is preferred over `confirm()` for both `yesno` and the comment prompt because (a) `confirm()`'s boolean return collapses "No" and user-dismissal into the same value, which would silently submit a default answer when the user cancels via Esc; (b) `yesno` questions support `allowOther`, which adds a third option that `confirm()` cannot represent; and (c) `yesno` questions can carry a `recommendation` that `select()` can visually highlight in the option list.

**Alternatives considered**:
- **Overlay-only UI**: rejected because it would unnecessarily exclude environments where `ctx.ui.custom()` is unavailable.
- **Dialog-only UI**: rejected because it would underdeliver on the approved richer decision UX.

### 6. Waiting is the default; v1 does not impose timeout behavior

**Decision**: In v1, `ask_user` does not impose automatic timeouts. The questionnaire remains active until the user submits, dismisses it explicitly, or the tool execution `signal` is aborted externally.

**Rationale**: In a CLI workflow, a blocked prompt is often the correct state when the agent truly needs user input to proceed. Adding timeout would usually convert “waiting for input” into a different terminal failure without materially helping the agent continue safely. Keeping the tool resumable until the user or runtime intervenes is simpler and more predictable.

**Alternatives considered**:
- **Model-provided timeout parameter**: rejected because it gives the model control over user patience and complicates the contract.
- **Runtime-policy timeout in v1**: rejected because it mostly transforms a wait state into a failure state while adding implementation and testing complexity.

### 7. Return hybrid tool results with structured per-question answers

**Decision**: `content` will contain a short natural-language summary suitable for immediate continuation, while `details` will include normalized questions, per-question answers keyed by stable ID, answer source metadata, terminal-state metadata, and optional comments. In v1, answer sources are `option`, `other`, `text`, and `yesno`; terminal states are tracked separately as `submitted`, `cancelled`, or `aborted`.

**Rationale**: The model should not need to parse a raw JSON block just to continue, but the extension still needs durable, structured result data for custom rendering, debugging, and future session reconstruction. Hybrid output provides both.

**Alternatives considered**:
- **Structured output only**: rejected because it makes the tool harder for the model to consume conversationally.
- **Natural-language output only**: rejected because it loses fidelity and makes future tooling harder.

### 8. Split the extension into focused modules rather than a monolithic file

**Decision**: Implement the change as a small `ask-user/` module set covering schema/types, normalization, questionnaire flow, UI adapters, and transcript rendering, with the single-active-questionnaire guard enforced per extension session rather than as a cross-process global singleton.

**Rationale**: The repo already favors small, reviewable extension files. This change combines schema validation, state transitions, and UI rendering, which are easier to reason about and test independently when separated.

**Alternatives considered**:
- **Single-file implementation**: rejected because it would concentrate multiple responsibilities into one large file and become harder to maintain.

## Reference Implementations

These references are implementation aids only. They are non-normative and do not override the requirements in `specs/ask-user/spec.md` or the decisions in this design.

- **Local pi examples**: `question.ts` and `questionnaire.ts` should be the first lookup points for pi-native tool registration, schema patterns, and bounded questionnaire flows.
- **pi-native external reference**: `edlsh/pi-ask-user` is the best reference for overlay UI, fallback dialog behavior, prompt guidance, and custom transcript rendering in pi.
- **Flow/behavior reference**: `can1357/oh-my-pi` `ask.ts` is the best reference for multi-question navigation, recommendation-aware flows, and cancellation/abort handling.
- **Contract-shape references**: Claude/Codex/Gemini user-input docs are useful for schema ergonomics and decision-oriented prompting, but SuPi should follow pi-native APIs and the bounded scope defined here.

## Risks / Trade-offs

- **[Schema complexity vs. model usability]** → Keep the external schema typed but small, with hard bounds and prompt guidance that explicitly tells the model to ask focused questions only.
- **[Overlay and fallback behavior drifting apart]** → Use one normalized questionnaire model and shared result formatter so both UI paths obey the same semantics.
- **[Transcript verbosity]** → Keep `content` summaries compact and rely on `renderResult` plus `details` for richer review instead of printing raw structures directly.
- **[Blocked prompts can wait indefinitely]** → Accept this as the correct v1 behavior when explicit user input is required, and rely on user dismissal or runtime abort rather than timeout heuristics.
- **[UI implementation scope growing too large]** → Limit v1 to 1–4 questions, a bounded option count, linear next/back/review flow, and optional notes only for structured questions.

## Migration Plan

- Add the new `ask-user/` extension files and register the entry in `package.json` under `pi.extensions`
- Add unit and behavior tests for normalization, flow state, fallback behavior, and transcript rendering
- Validate packaging/runtime behavior with existing repo commands (`pnpm typecheck`, `pnpm test`, `pnpm biome:ai`, `pnpm pack:check`)
- Rollback is straightforward: remove the extension entry and the new `ask-user/` files if the tool needs to be backed out before release

## Open Questions

- None for implementation readiness; v1 decisions are intentionally narrowed in this design. Future iterations can revisit richer branching questionnaires or idle-timeout policy if real usage justifies them.
