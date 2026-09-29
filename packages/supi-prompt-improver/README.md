# @mrclrchtr/supi-prompt-improver

Command-based prompt improvement for the [pi coding agent](https://github.com/earendil-works/pi).

## Install

```bash
pi install npm:@mrclrchtr/supi-prompt-improver
pi install npm:@mrclrchtr/supi-settings
```

The model picker is provided by `@mrclrchtr/supi-settings`. Install it separately. Prompt improver does not bundle that extension because another installed copy may already register `/supi-settings`. After both installs, run `/reload` in Pi to use the model picker. The package also loads the shared Ask User form that it needs for clarification.

## Configuration

Open `/supi-settings` → **Prompt improver** → **Improver model**. The default is `disabled`. Select a model to enable improvement. The command does not use the main model as a fallback.

## Use

1. Run `/supi-improve [draft]` while Pi is idle in TUI mode.
2. Enter or edit the draft in the local form. Command arguments prefill this form.
3. Confirm the draft. The command copies it to the main editor before improvement starts.
4. Answer clarification questions if needed. The command can ask questions in one Ask User form, within the shared form limits.
5. Review the proposal. Accept it to replace the editor text, or dismiss it to keep the confirmed draft.
6. Make any further changes in the main editor, then submit the request yourself.

Pi clears the main editor before the command runs. The command cannot restore text that Pi cleared when you entered the command.

Acceptance does not submit the request. Dismissal, cancellation, an error, or an unchanged result keeps the confirmed draft unless another action has changed the editor or session. The feature does not add an undo action or store an undo record.

Each invocation uses one temporary conversation kept in memory. A clear draft needs one model request. If clarification is needed, the submitted form continues that conversation with one final request. The feature does not open a Pi child session or carry this conversation into the next invocation.

## Privacy

The selected provider receives the confirmed draft and the context categories shown in the proposal screen. Context can include already-loaded project guidance, recent projected user and assistant text, and one available session summary. It does not include tool results, tool arguments, skills, or the full system prompt. The command does not scan files, call tools, use the web, or make a summary request.

The draft controls the request's intent. Context is background only. Assistant messages are treated as claims, not verified facts.

By default, the feature does not retain drafts, answers, proposals, or response content in diagnostics. Pi can keep the submitted command text in its normal history. Provider retention rules still apply.

## Optional diagnostics

Prompt-improver diagnostics are off by default. To enable them, install `@mrclrchtr/supi-debug` and turn on **Debug > Enabled** in `/supi-settings`. The shared debug registry keeps events in memory. The `supi-debug` extension also persists sanitized events as custom entries in the current Pi session. Prompt improver does not depend on or call that extension directly.

When enabled, diagnostics can contain the confirmed draft, selected context, prepared request, provider response snapshot, clarification questions and answers, proposal, and error details. These can include private content. Events use sanitized `data`, never `rawData`, and obey the shared `agentAccess` setting. Secret redaction is best-effort; it may not remove every secret. Review the content before you enable capture or share a session file. Setting **Agent Access** to `off` blocks access through the debug tool but does not stop capture. Turn **Enabled** off to stop new capture. This does not remove events already written to a session file.

Capture has size limits, but these limits do not make captured content private. See the [diagnostics contract](SPEC.md#opt-in-diagnostics) for exact limits and provider-field rules.

Use `/supi-debug source=prompt-improver` to inspect current events. The report displays matched content in the session. For an earlier session, add `sessionFile=<path>` with the Pi session JSONL path. Historical events are sanitized. Keep the session file and any report private.

## Text support

Input is text-only. Expanded text pastes are supported. Literal paths stay as text; the feature does not read those files. The feature rejects known unresolved Pi paste markers. It cannot detect every attachment from every custom editor and does not support attachment refinement.

## Limits

- Draft: 32,000 Unicode code points.
- Loaded project guidance: 12,000 code points.
- Recent projected conversation: 12,000 code points and up to 12 messages.
- One session summary: 4,000 code points.
- Clarification: one form within the shared Ask User question limits.

The feature checks the complete conversation before each request, including clarification answers and comments. It drops optional context when needed. If required content still does not fit, it stops and keeps the confirmed draft. It does not trim the draft or answers, ask a second clarification round, or retry a rejected request.

## Developer references

- [Behavior contract](SPEC.md): ownership, context, model requests, diagnostics, and acceptance criteria.
- [Domain terms](CONTEXT.md): draft, proposal, clarification, and improvement session.
- [Package guidance](CLAUDE.md): implementation safeguards and package checks.
