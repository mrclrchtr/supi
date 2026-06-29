# Tool Rendering Convention

Every SuPi tool that produces output in the session history must provide a human-readable TUI rendering. The rendering is separate from the agent-facing output — the agent always receives the full `content` in session history, regardless of collapsed/expanded state.

## When this applies

This convention applies to **non-interactive tools** — tools whose output appears directly in the session history without user interaction.

Tools that use `renderShell: "self"` for fullscreen interactive control (e.g. `ask_user`) are exempt. Tools whose output is always trivially small may skip the collapsed/expanded pattern — use judgment and decide before implementation.

## Slots

### renderCall

Always visible. A compact single-line header showing the tool name and its most salient arguments. No mandated format.

```ts
// Example: supi-web's web_fetch_md
renderCall(args, theme) {
  return renderToolCall("web_fetch_md", url, theme, outputMode);
}

// Example: supi-code-intelligence's code_graph
renderCall(args, theme) {
  return renderGraphCall(args, theme); // "code_graph → references of myFunction"
}
```

### renderResult

Renders the tool output. Receives `{ expanded, isPartial }` in the options parameter.

#### Collapsed (default)

A compact human-readable summary built from structured `details` data. Must **never** show raw agent-facing output — the summary is a human interpretation, not the LLM's content.

```ts
// Good: human summary from details
"6 results · confidence high"
"Fetched Markdown (1,234 chars, 42 lines)"
"1 file with issues"

// Bad: leaking agent output into the collapsed view
"file.ts:42: error TS2322: Type 'string' is not assignable..."
```

Collapsed views should be one or two lines. Counts, status, and key metrics are appropriate. Full output, diffs, and file contents belong in the expanded view.

#### Expanded (ctrl+o)

Full human-readable detail. May include structured sections, evidence lists, body text, or the raw markdown `content` as a collapsible detail view. Built from `details` data or the markdown text — never requires parsing the markdown string to construct chrome.

#### Partial (streaming)

A progress indicator while the tool is still running.

```ts
if (isPartial) {
  return new Text(theme.fg("warning", "Searching…"), 0, 0);
}
```

#### Error

An error state when the tool fails.

```ts
if (result.isError) {
  return new Text(theme.fg("error", "code_graph failed"), 0, 0);
}
```

## The details contract

The `execute` function must return structured `details` alongside `content`:

```ts
return {
  content: [{ type: "text", text: "full agent-facing output..." }],
  details: {
    // structured data for human rendering
    candidateCount: 6,
    confidence: "high",
    evidenceLists: [...],
  },
};
```

TUI chrome (headers, badges, counts, section toggles) must be built from `details`, never by parsing the markdown `content` string. This is the **dual-surface rendering** rule: chrome and body are independent consumers of the same underlying evidence. See `CONTEXT.md` for the glossary definition.

## No shared rendering library

Each package owns its rendering implementation. Small helpers are fine (`renderToolCall`, `renderCollapsibleTextResult`, `renderSimpleResult`) but they live in the package that uses them. There is no cross-package rendering utility.

## Keybinding hints

PI users know `ctrl+o` expands/collapses tool output. Including a `keyHint("app.tools.expand")` is optional — it is a well-known PI convention and not required by this document.

## Reference implementations

- **Simple text tools**: `packages/supi-web/src/tool/render.ts` — `renderToolCall` and `renderCollapsibleTextResult`
- **Structured widget tools**: `packages/supi-code-intelligence/src/presentation/tui/` — per-tool renderers sharing `common.ts` (`renderSimpleResult`, `renderEvidenceLines`, `renderMarkdownDetail`)
- **Fullscreen interactive**: `packages/supi-ask-user/src/ask-user.ts` — `renderShell: "self"`, exempt from this convention
