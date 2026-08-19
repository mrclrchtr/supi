# Tool Rendering Convention

This document defines SuPi's human-facing transcript convention for PI tools. SuPi policy is stricter than PI's optional renderer API. For PI API rules, see [PI Extension Tool Guidelines](../pi/tool-guidance.md#rendering-and-tui-rules).

A tool has separate surfaces:

- **Agent surface** — Final `content` text or image blocks. PI stores this content in the tool-result session entry and uses it as model-facing tool-result content. The content can already be bounded or truncated. Collapsing or expanding the TUI does not change it. Partial `onUpdate()` content is not sent to the model or stored in the session.
- **Human transcript surface** — `renderCall` and `renderResult` components. PI uses these in the interactive TUI. Current-session HTML export can also reuse them for custom tools. Standalone `pi --export` has no active extension tool definitions and does not reuse extension renderers.
- **Details surface** — Final `details` metadata for UI, logs, and state reconstruction. PI stores it with the tool result. PI does not automatically send it to the model as tool output. Partial `details` from `onUpdate()` are transient runtime data unless the final result includes them.
- **Transient UI** — `ctx.ui.custom()` components shown while a tool runs. This is separate from transcript rendering.

## Scope

Every non-trivial SuPi tool that produces a result in the PI transcript must define `renderCall` and `renderResult`, or document an explicit exception. Do not rely on PI's generic fallback for normal SuPi tools. A deliberately machine-only tool may use the fallback only when its package documents that choice.

This convention covers the transcript result. It does not define a temporary form or overlay opened during execution.

### Interactive execution is separate

A tool may open a temporary form with `ctx.ui.custom()`. The tool still needs a transcript renderer when its result appears in session history.

`renderShell: "self"` is not an interactive or fullscreen exemption. It replaces PI's default `Box`. The tool then owns its outer framing, padding, and background. It does not open a form or take keyboard input by itself.

`ask_user` is an example of both surfaces:

- `packages/supi-ask-user/src/ui/form.ts` opens the temporary form.
- `packages/supi-ask-user/src/render/transcript.ts` renders the completed tool result.

Custom messages and durable custom entries use different APIs. Use `registerMessageRenderer()` for `pi.sendMessage()` messages and `registerEntryRenderer()` for `pi.appendEntry()` entries. Build their chrome from `message.details` or `entry.data`; do not recover structured facts from message text.

## Slots

### `renderCall`

`renderCall` should show a compact call header, preferably on one line. Include the tool name and the most useful arguments. Do not print large arguments, secrets, or the full prompt. Arguments can be incomplete while PI streams the tool call, so guard optional fields. Use `context.argsComplete` as a live-stream optimization hint, not as the only condition for required content. A restored row does not run through the live argument-completion transition.

The renderer receives `(args, theme, context)` and must return a PI TUI `Component`.

```ts
// Example: supi-web's web_fetch_md
renderCall(args, theme) {
  return renderToolCall(
    "web_fetch_md",
    args.url ?? "",
    theme,
    args.output_mode,
  );
}

// Example: supi-code-intelligence's code_graph
renderCall(args, theme) {
  return renderGraphCall(args, theme); // "code_graph → references of myFunction"
}
```

### `renderResult`

`renderResult` receives `(result, { expanded, isPartial }, theme, context)`. The options describe the requested view and the current execution state.

Use `context.isError` for a PI execution failure. The renderer API does not define `result.isError`.

```ts
renderResult(result, { expanded, isPartial }, theme, context) {
  if (isPartial) {
    return new Text(theme.fg("warning", "Searching…"), 0, 0);
  }

  if (context.isError) {
    return new Text(theme.fg("error", "code_graph failed"), 0, 0);
  }

  const details = result.details as GraphDetails | undefined;
  // Build the settled view from details.
  return new Text(formatSummary(details, expanded, theme), 0, 0);
}
```

Use `context.args` in `renderResult` when the result view needs call arguments. Use `context.state` only for data shared by the call and result slots. Use `context.lastComponent` when an existing component can be updated in place.

#### Collapsed (default)

The settled collapsed view is a compact human-readable summary. Build its status, counts, badges, and key metrics from structured `details` data.

```text
6 results · confidence high
Fetched Markdown (1,234 chars, 42 lines)
1 file with issues
```

Do not dump arbitrary agent-facing content into the collapsed view. A deliberately small result may show its content directly, but it must still remain bounded and readable. One or two lines is the normal target. A bounded list of task progress rows is acceptable for a multi-task partial result.

#### Expanded

The expanded view provides more human-facing detail. It may contain structured sections, evidence lists, bounded body text, or an optional raw Markdown detail view.

Large output, long lists, diffs, and file contents must remain bounded. If the agent-facing output was truncated or written to a file, show the truncation state and the full-output path when available. Do not promise data that is not available in `content` or `details`.

Structured tools should build their primary body from `details`. Text tools may show `content` as the expanded body. In both cases, never parse Markdown `content` to create TUI chrome.

#### Partial (streaming)

Long-running tools should call `onUpdate()` with a small progress payload. PI passes `isPartial: true` to `renderResult` for these payloads and `isPartial: false` for the final result. PI treats each update as a complete partial result; it does not merge updates or copy them into the final result. Calls made after `execute()` settles are ignored.

Partial `details` can have a different or incomplete shape than the final result. Treat optional fields as optional.

#### Error

Show a clear error state when `context.isError` is true. PI sets this state when `execute()` throws. Validation failures, blocked calls, and hook failures can also produce an error result. Returning text such as `"Error: ..."` is still a successful tool result, so domain-level errors need their own status in `details` when the tool uses that pattern.

## The details contract

When a custom renderer needs structured facts, return final `details` from `execute()` and include partial `details` in each `onUpdate()` payload:

```ts
interface SearchDetails {
  resultCount: number;
  confidence: "high" | "medium" | "low";
  evidenceLists: EvidenceList[];
}

return {
  content: [{ type: "text", text: modelOutput }],
  details: {
    resultCount: 6,
    confidence: "high",
    evidenceLists,
  } satisfies SearchDetails,
};
```

Keep `details`:

- JSON-serializable, because PI stores it in session data.
- Typed and stable across reload, resume, and branch reconstruction.
- Small enough for session storage. Do not duplicate a large body when a summary or file path is enough.
- Free of secrets and other data that should not persist in the session.

`details` may be `undefined` for a deliberately simple result. A renderer must handle absent or malformed details without crashing.

Keep `content` concise and model-relevant. PI does not automatically truncate custom tool text. For large results, use PI's default limit of 2,000 lines or 50 KB, whichever is reached first. Tell the model when output is truncated, and provide a full-output path when practical. See [Output Size](../pi/tool-guidance.md#output-size).

## Dual-surface rendering

The human surface has two independent parts:

- **Chrome** — the call header in `renderCall`, plus result status, badges, counts, evidence disclosures, and section controls in `renderResult`. The call header uses tool-call arguments. Result chrome uses `details` and PI state such as `options.isPartial` and `context.isError`.
- **Body** — the main human-facing result. Structured tools use `details` for the primary body. Text tools may use `content` as an optional expanded body or raw Markdown detail.

Do not parse Markdown `content` to recover structured facts. It is valid to pass `content` to a Markdown component for body rendering. Markdown and TUI are independent projections of the same underlying result evidence. See [Tool package architecture](tool-architecture.md) for the result-assembly rule.

## Shell, fallback, and component rules

- PI wraps ordinary tool renderer output in a default `Box` with padding and background. Do not add outer padding. For `Text`, use `(0, 0)` unless the tool uses `renderShell: "self"`.
- With `renderShell: "self"`, the tool provides its own framing, padding, and background. Use it only when the default shell prevents the required layout.
- For an ordinary custom tool, a missing or failed `renderCall` falls back to the tool name. A missing or failed `renderResult` falls back to plain output derived from `content`.
- A built-in override inherits each omitted renderer slot from the built-in tool. If the selected renderer throws, PI uses the generic fallback for that slot.
- Each custom component must fit every rendered line within the supplied width and implement `invalidate()`. Invalidation must clear render caches and rebuild stored themed strings. See [TUI Components](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/tui.md).

## Shared ownership

Do not create a shared cross-package TUI component library. Each package owns its tool renderer and its tool-specific presentation policy.

Pure, domain-neutral formatters may be shared when the shared package owns the meaning. A formatter such as an evidence badge is different from a package-independent tool renderer.

## Keybinding hints

The default binding for `app.tools.expand` is `Ctrl+O`, but users can change it. Use `keyHint("app.tools.expand", "to expand")` when a collapsed view needs an affordance. Do not hardcode `Ctrl+O` in rendered UI text.

## Review checklist

Before merging a tool, check that its renderer:

- Shows a compact call header from safe, bounded arguments.
- Handles collapsed, expanded, partial, and `context.isError` states.
- Handles missing or incomplete `details`.
- Builds result chrome from `details`, not by parsing Markdown.
- Discloses truncation and continuation paths.
- Keeps settled output compact and progress output bounded.
- Fits custom components to the available width and supports invalidation.
- Has focused tests for the main states.

## Package examples

These files show package-specific patterns. Check the complete tool registration against the review checklist before you copy a pattern.

- **Simple text helpers**: `packages/supi-web/src/tool/render.ts` — `renderToolCall` and `renderCollapsibleTextResult`
- **Structured code tools**: `packages/supi-code-intelligence/src/tool/<tool>/tui.ts` — per-tool renderers sharing `packages/supi-code-intelligence/src/ui/tui/common.ts`
- **Stateful multi-task tool**: `packages/supi-agent/src/tool/render.ts` — bounded progress and conversation views
- **Review results**: `packages/supi-review/src/tui/run.ts` — task verdicts and structured findings
- **Blocking interactive form**: `packages/supi-ask-user/src/ui/form.ts` opens the form; `packages/supi-ask-user/src/render/transcript.ts` renders the transcript result
