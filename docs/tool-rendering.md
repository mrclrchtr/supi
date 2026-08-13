# Tool Rendering Convention

This document defines SuPi's human-facing transcript convention for PI tools. For PI API rules, see [PI Extension Tool Guidelines](pi/tool-guidance.md#rendering-and-tui-rules).

A tool result has separate surfaces:

- **Agent surface** — `content` text or image blocks. PI sends this to the model and stores it in the tool-result session entry. The content may already be bounded or truncated. Collapsing or expanding the TUI does not change it.
- **Human transcript surface** — `renderCall` and `renderResult` components. PI uses these in the interactive TUI. PI's HTML export can also reuse them.
- **Details surface** — `details` metadata for UI, logs, and state reconstruction. PI stores it with the tool result. PI does not automatically send it to the model as tool output.
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

Commands and durable custom entries use different APIs. Use `registerMessageRenderer()` for `pi.sendMessage()` messages and `registerEntryRenderer()` for `pi.appendEntry()` entries. Apply the same details-first rule where those surfaces have structured data.

## Slots

### `renderCall`

`renderCall` should show a compact call header, preferably on one line. Include the tool name and the most useful arguments. Do not print large arguments, secrets, or the full prompt. Arguments can be incomplete while PI streams the tool call, so guard optional fields and use `context.argsComplete` for expensive previews.

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

Use `context.isError` for a PI execution failure. There is no reliable `result.isError` field in the renderer contract.

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

Long-running tools should call `onUpdate()` with a small progress payload. While an update is active, `isPartial` is true.

Partial `details` can have a different or incomplete shape than the final result. Treat optional fields as optional.

#### Error

Show a clear error state when `context.isError` is true. PI marks a tool as failed when `execute()` throws. Returning text such as `"Error: ..."` is still a successful tool result, so domain-level errors need their own status in `details` when the tool uses that pattern.

## The details contract

When a custom renderer needs structured facts, `execute()` and `onUpdate()` should return `details` alongside `content`:

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

Keep `content` concise and model-relevant. Apply PI's output limits to large results, tell the model when output is truncated, and provide a full-output path when practical. See [Output Size](pi/tool-guidance.md#output-size).

## Dual-surface rendering

The human surface has two independent parts:

- **Chrome** — the call header in `renderCall`, plus result status, badges, counts, evidence disclosures, and section controls in `renderResult`. The call header uses tool-call arguments. Result chrome uses `details`.
- **Body** — the main human-facing result. Structured tools use `details` for the primary body. Text tools may use `content` as an optional expanded body or raw Markdown detail.

Neither part parses Markdown `content` to recover facts. Markdown and TUI are independent projections of the same underlying result evidence. See [Tool package architecture](tool-architecture.md) for the result-assembly rule.

## Shell, fallback, and component rules

- PI wraps ordinary tool renderer output in a default `Box` with padding and background. Use `Text` or other components with `(0, 0)` padding unless the tool uses `renderShell: "self"`.
- With `renderShell: "self"`, the tool provides its own framing, padding, and background. Use it only when the default shell prevents the required layout.
- If a renderer is missing or throws, PI falls back to the tool name or raw text from `content`. This fallback is useful for recovery but is not the normal SuPi design for non-trivial tools.
- Custom components must fit each rendered line within the supplied width and must implement invalidation correctly. See [TUI Components](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/tui.md).

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

## Reference implementations

- **Simple text tools**: `packages/supi-web/src/tool/render.ts` — `renderToolCall` and `renderCollapsibleTextResult`
- **Structured code tools**: `packages/supi-code-intelligence/src/tool/<tool>/tui.ts` — per-tool renderers sharing `packages/supi-code-intelligence/src/ui/tui/common.ts`
- **Stateful multi-task tool**: `packages/supi-agent/src/tool/render.ts` — bounded progress and conversation views
- **Review results**: `packages/supi-review/src/tui/run.ts` — task verdicts and structured findings
- **Blocking interactive form**: `packages/supi-ask-user/src/ui/form.ts` opens the form; `packages/supi-ask-user/src/render/transcript.ts` renders the transcript result
