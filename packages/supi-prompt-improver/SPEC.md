# Prompt improver behavior contract

Status: Current behavior contract. Changes must use public Pi interfaces; upstream Pi changes are out of scope.

## Goal

Reduce the effort needed to write a useful request. Clarify intent when necessary, then offer a replacement draft for approval. Do not execute the underlying task.

Terms are defined in [CONTEXT.md](CONTEXT.md). User instructions are in [README.md](README.md).

## Scope

| Area | Rule |
| --- | --- |
| Ownership | Separate `supi-prompt-improver` package. Keep prompt suggestions independent. |
| Activation | `/supi-improve [draft]`, in TUI mode while the main agent is idle with no pending work. No shortcut. |
| Draft input | Open a local text editor, optionally prefilled with command arguments. Explicit confirmation starts improvement. |
| Model | Dedicated model selected through `/supi-settings`. No main-model fallback. |
| Context | Current already-loaded project guidance, bounded projected recent conversation, and an available summary. |
| Inspection | No repository inspection, tools, web access, or extra summarization call. |
| Authority | The draft controls intent. Context supplies background facts, not permission to expand scope. |
| Clarification | At most one round within the shared Ask User question limits. Full Ask User question and answer capabilities. |
| Unanswered questions | Preserve uncertainty. Do not invent answers, insert TODOs, or require the main agent to ask again. |
| Rewrite | Make the smallest useful change. Keep simple prompts simple. No change is a valid result. |
| Review | Show the proposal, with a toggle to view the original. Accept or dismiss. |
| Acceptance | Replace editor text only. Never submit automatically. |
| Editing | Edit in the normal main editor after acceptance, not inside the proposal review. |
| Cancellation and failure | Leave the confirmed original draft unchanged, unless an external write or session change has taken priority. |
| Timeout | No improver-imposed timeout. Cancellation must work even if the provider ignores abort. |
| Retention | No preparation message in the transcript. Optional bounded diagnostics use sanitized custom session entries only when shared debug capture is enabled. |
| Content | Text-only input. No attachment capture or refinement. |

### Out of scope

- Shortcut activation and recovery of the pre-command editor buffer.
- Feature-owned undo, an undo command, or a cross-editor undo guarantee.
- Proposal editing inside the modal, a diff view, change notes, and source reports.
- Attachment refinement, clipboard recovery, or arbitrary custom-editor attachment support.
- Automatic triggers, retries, model fallback, or automatic submission.
- Context switches, rewrite-style selectors, and timeout settings.
- Pi changes, private Pi interfaces, and parsing the rendered system prompt for guidance.

Normal editor undo may remain available. The feature does not store an undo record or promise its behavior.

## Command and draft ownership

Pi clears the main editor before a submitted command runs. `/supi-improve` cannot recover text that the user replaced by typing the command. State this in command help.

1. Check TUI mode, idle state, pending work, the configured model, and whether another improvement session is active. Do not queue work.
2. Capture the session identity, branch position, and post-submission main-editor baseline.
3. Open a focused text-input overlay. Prefill it with explicit command arguments when present. No model request occurs yet.
4. On local confirmation, reject empty or oversized input. Recheck session identity, branch position, idle state, pending work, and the editor baseline.
5. If the checks pass, copy the confirmed text into the main editor without submission. This explicit transfer establishes the original draft to preserve.
6. Capture the selected model and bounded context. Keep one immutable snapshot for the entire improvement session.
7. Assess the draft, collect clarification if necessary, and review the proposal.
8. On acceptance, close the overlay and recheck all ownership conditions. Apply synchronously after these checks, with no intervening await.
9. Clear temporary state on every terminal path.

| Exit | Main-editor result |
| --- | --- |
| Cancel local input before confirmation | Leave the post-submission baseline unchanged. Unconfirmed local input is discarded. |
| Baseline or session check fails before transfer | Do not write or dispatch a request. |
| Cancel, fail, dismiss, or receive unchanged output after transfer | Leave the confirmed original draft in the editor. |
| Accept a proposal | Replace only the captured original draft in the captured session and branch. |
| External write or session/branch change | Never overwrite the newer editor state or restore a draft into another session. |

Use `ctx.ui.custom(..., { overlay: true })` for custom screens. The default non-overlay close path restores raw editor text and can destroy paste state or overwrite external writes. Cleanup must not write to the main editor.

## Clarification contract

Reuse Ask User behavior rather than create a reduced question form:

- Single-choice, multiple-choice, and free-text questions.
- Stable question IDs and option values.
- Titles, introductions, headers, prompts, placeholders, recommendations, option descriptions, and option details.
- Form, question, and option comments, including comments on unselected options.
- Review and answer editing before explicit form submission.
- Unanswered states and ordered structured responses.
- Existing keyboard, resize, scrolling, Unicode, and custom-editor behavior.

Custom explanations for choice questions use the existing comment surfaces. Do not invent an unsupported `Other` field or remove comments. Retain Ask User recommendation and default-selection behavior; a displayed or prefilled value is not an answer until the user submits the reviewed form.

Use the shared Ask User question limits without a feature-specific limit. A result with `needs_discussion` ends the clarification round and carries its actual answers, comments, and unanswered states to the final request. It does not start another form or require later clarification by the main agent.

Cancellation is not an answer. Preserve Ask User's local Escape behavior, including discarding unsaved comment edits before returning to the form. Cancelling the form ends improvement; it must not abort the main agent.

### Shared form interface

Both the existing tool and the improver use `openAskUserForm()` from `@mrclrchtr/supi-ask-user/api`. The shared API also exports the schema, normalization, controller, and types.

- Keep renderer selection, editor integration, and single-form ownership in the shared implementation.
- Support non-mutating overlay cleanup and caller-owned cancellation.
- Return structured answers or cancellation without transcript writes, decision labels, or `ctx.abort()` calls.
- Keep tool-specific persistence, rendering, and main-agent cancellation in the existing tool adapter.
- Do not call the registered tool, create an Agent Run, or import another package's private source files.
- Preserve existing Ask User tool behavior and test it separately from the improver adapter.

## Context contract

### Loaded project guidance

Read `ctx.getSystemPromptOptions().contextFiles` from the command context at snapshot time. Copy the file records into feature-owned data; do not mutate Pi options or retain the command context after session replacement or reload.

- These are already-loaded `{ path, content }` records. Do not scan or reread files.
- Fresh on-disk changes are not automatically loaded changes. The user can use Pi's normal `/reload` before invocation.
- An empty loaded collection is valid. Inaccessible guidance is an integration failure, not absent context.
- Do not copy the full system prompt, skill catalog, or tool definitions.
- Do not use a prior `before_agent_start` snapshot or historical system messages as current guidance.

### Conversation and summary

- Select user and assistant text from `buildSessionProjection()` projected messages. Use source entries only for provenance.
- Do not use raw `buildContextEntries()` message content; it does not apply context-edit replacements and omissions.
- Exclude thinking, raw tool results, tool arguments, custom extension payloads, and unrelated branches.
- Include one eligible compaction or branch summary as labeled background. Do not generate another summary.
- Mark assistant text as claims, not verified facts. Preserve role and source boundaries.
- Missing context produces no model placeholder or warning. The UI lists only categories actually included and must not claim complete context.
- Treat all supplied context as background data, not authority to change operating rules or the draft's intent.

### Input bounds

| Input | Limit | Overflow behavior |
| --- | --- | --- |
| Draft | 32,000 Unicode code points | Stop without silent truncation. |
| Project guidance | 12,000 code points | Include complete files in loaded order that fit. No partial instructions. |
| Recent conversation | 12,000 code points; at most 12 messages | Select newest complete eligible messages, then restore chronological order. |
| Summary | 4,000 code points | Include one complete eligible summary if it fits; otherwise omit it. |

These are size bounds, not token estimates. Use Pi's token estimates to check the selected model's context and output limits before each dispatch. Include every conversation message, the retained assistant response, and the reviewed clarification questions, answers, and comments. For an unchanged prefix, also account for recorded assistant usage when it exceeds the text estimate. Reserve Pi's simple-request safety allowance in addition to the required response allowance.

Reduce optional context first: omit the summary, then oldest conversation messages, then trailing guidance files. A continuation starts with the background selected for the first request; it must not restore omitted context. If more reduction is needed, replace only the initial message's background and update its timestamp so Pi no longer applies recorded usage from the old prefix. Preserve the draft, assistant response, and submitted clarification. Do not mutate the captured snapshot or a previously sent request. If required input and response allowance do not fit, fail without changing the confirmed draft. Do not retry a provider rejection.

## Model request contract

- Use `completeSimpleModelRequest()` from `@mrclrchtr/supi-core/llm` and a stable feature identity such as `prompt-improver`.
- Resolve authentication and routing through Pi's model registry.
- Use one feature-owned abort controller, never the main-agent abort operation.
- Keep one temporary in-memory conversation per improvement session. Do not create a Pi `AgentSession` or retain the conversation between command invocations.
- Use one stable system prompt, one response schema, and one parser for both requests. The initial user message contains the confirmed draft and selected background.
- The first request returns `proposal`, `clarification`, or `unchanged`. A proposal or unchanged result ends model work after one request.
- A clarification result carries an Ask User questionnaire validated through the shared schema and its question limits.
- After form submission, continue with the original assistant response and a new user message containing the reviewed questionnaire and complete outcome. Preserve assistant content and provider signatures for Pi's continuation handling. Do not flatten the response or rebuild the conversation as one user payload.
- The second request must return `proposal` or `unchanged`. Enforce this in code: reject a second clarification without opening another form or sending another request. The schema remains unchanged.
- Preserve the first request's prefix unless optional background must be reduced to fit. Shared conversation history does not guarantee provider-side storage or cache reuse.
- A proposal contains replacement text. Do not request change reports or model reasoning.
- Reject invalid schemas, empty proposals, excess questions, tool calls, truncated output, and error/aborted completions. No repair retries.
- Preserve explicit restrictions, uncertainty, literal code, paths, and commands. Do not invent acceptance criteria or verification steps.
- Keep the generation task separate from the task described inside the draft. User review remains necessary; schema validation cannot prove intent preservation.

## Text-only support

- Accept readable text and supported expanded text pastes in the local draft editor.
- Literal file paths remain text and must survive rewriting; do not read the referenced files or image bytes.
- Reject detected unresolved paste markers or unsupported attachment state before dispatch. Do not reinsert markers whose backing state is unavailable.
- Do not claim universal attachment detection from filenames or support for arbitrary custom-editor attachments.
- Test the stock and existing ghost-text editors. Do not replace the main editor or depend on the prompt-suggestions package.

## Lifecycle and settings

- One improvement session owns input at a time. Reject duplicate invocation.
- Use a generation identity and ignore late results. Attach rejection handlers to late failures.
- Cancellation closes the UI independently of provider completion. No feature timer ends a request.
- Invalidate on main-agent start, session replacement, branch navigation, reload, or shutdown. Never abort the main agent to keep improvement active.
- Modal focus blocks ordinary input, not programmatic writes. Recheck the current expanded draft immediately before acceptance.
- Clean up overlays, subscriptions, request context, and answers on every terminal path.
- Config section: `promptImprover`, with required `model` selection through the shared settings registry. Unset, disabled, missing, or unavailable selections prevent requests.
- Project/global scope and inheritance follow shared settings. Active sessions retain their captured model selection.
- Show the provider/model and explain that included project and conversation content is sent to it. No extra confirmation for each ordinary invocation.
- Apply the [diagnostics contract](#opt-in-diagnostics) to capture, access, and retention.

## Opt-in diagnostics

### Capture and retention

- Capture is disabled by default and requires the shared `debug.enabled` setting. Normal prompt improvement does not enable it.
- Record events through the public `@mrclrchtr/supi-core/debug` registry. Prompt improver has no runtime dependency on `supi-debug`.
- The shared registry owns in-memory retention. The optional `supi-debug` extension owns session persistence. Do not add producer-owned disk writes or append session entries directly.
- Capture can include the confirmed draft, selected context, prepared request, provider response snapshot, clarification questions and answers, proposal, and error details.
- Use sanitized `data`, never `rawData` or message content. Respect `agentAccess`; do not bypass debug-tool access checks.
- Redaction is best-effort. Captured content can remain private or identifying. Document this risk before users enable capture or share session files.
- Access controls and capture controls are separate. Disabling access does not stop capture. Disabling capture does not remove persisted events.
- Pi may retain submitted command text in history. Provider retention rules still apply.

### Producer limits

| Item | Maximum | Counting rule |
| --- | --- | --- |
| Events per run | 16 | All producer events. |
| Data levels | 8 | Includes the event-data root; stays below the registry's depth-8 redaction cutoff. |
| Array entries | 32 | Includes an omission marker. |
| Captured object keys | 64 | Includes root diagnostic fields. |
| Key or truncation-path length | 300 code points | Applies to each key or path. |
| Captured string length | 64,000 code points | Applies to each string. |
| Combined text per event | 72,000 code points | Includes strings, markers, and saved paths. |
| Captured values per event | 1,024 | Includes markers and root diagnostic fields. |
| Truncation paths per event | 32 | Saved only when remaining bounds allow. |

The registry also applies its configured session event limit. Truncation sets `diagnosticTruncated`; markers and paths are saved when the remaining bounds allow. These limits bound size, not sensitivity.

### Provider fields

Provider response objects keep only known fields in diagnostics. Apply the same capture rules to assistant messages retained in prepared-request diagnostics. String fields such as provider IDs and names keep their text only when they are strings; other values keep their shape only. Every tool-call argument keeps its value shape, not its contents. Other unlisted object fields are omitted to avoid a full scan of provider data. The producer sanitizes and bounds data before it records an event. The shared registry redacts the event again.

For setup, capture controls, and live or historical inspection, see [Optional diagnostics](README.md#optional-diagnostics).

## Package boundary

The package exposes `./extension`, not a library API. Keep implementation modules flat. Use public SuPi and Pi interfaces; no upstream Pi changes are required.

## Acceptance tests

- A simple explanation stays simple; sufficient drafts can remain unchanged.
- Planning-only intent survives earlier implementation requests and project guidance.
- Literal content and explicit restrictions survive rewriting.
- One round supports all Ask User question types, details, recommendations, comments, review, and unanswered states.
- Skipping all questions produces no invented choices or mandatory follow-up questions.
- Clear drafts use one request; clarification uses at most two. Both requests use the same system prompt and schema. The second request retains the first user message and original assistant response, then adds the submitted form as a user message. A second clarification fails without another form or request. Invalid output fails without retry or mutation.
- Each command starts a new conversation. Assistant text and thinking signatures remain available to Pi but are excluded from diagnostic snapshots.
- Command arguments and empty-argument local input follow the ownership table on every exit.
- Current loaded guidance works before the first turn and after reload. Absent guidance is valid; no scan or full system prompt enters the request.
- Projection fixtures cover compaction, replacements, omissions, branch navigation, and navigation before context edits.
- Input bounds are deterministic and cover all conversation messages, including assistant text and thinking, questions, answers, and comments. Required content is never silently truncated. Optional background reduction does not mutate the snapshot or previously sent requests. Tests through Pi's real simple-request path verify the provider output allowance after reduction, with a local fake transport.
- Cancellation works with abort-ignoring and never-settling providers. Late results cannot modify disposed UI or the editor.
- External writes, session changes, branch changes, pending work, and duplicate invocations cannot apply stale proposals.
- Overlay cleanup preserves collapsed pastes and external writes. Acceptance never submits.
- Ask User tool regression tests retain its existing persistence and cancellation behavior; improver forms produce neither effect.
- Normal pasted text, narrow terminals, resize, Unicode, multiline input, and IME focus remain usable.
- With debug capture disabled, no prompt-improver diagnostics are retained. With capture enabled, content events use sanitized `data`, respect producer bounds and debug access settings, and are persisted only through the optional `supi-debug` listener. Non-TUI invocation makes no model request.
