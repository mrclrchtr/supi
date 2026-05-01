## Context

Both `supi-claude-md` and `supi-lsp` inject context messages with `customType` via `before_agent_start` but set `display: false`. This means they're invisible in the TUI — they exist only in the LLM context. The LSP extension additionally shows a transient `ctx.ui.notify()` that fades after seconds, providing only momentary awareness.

Pi provides `registerMessageRenderer(customType, renderer)` which accepts a `(message, options, theme) ⇒ Component` function. Without a renderer, custom messages with `display: true` fall back to raw text. With one, they can show themed, collapsible sections with icons, colors, and details.

Both packages already depend on `@mariozechner/pi-tui` which provides `Box` and `Text` components needed for rendering.

## Goals / Non-Goals

**Goals:**
- Make context injection visible in the TUI with themed, collapsible renderers
- Replace the LSP's ephemeral `notify()` with a persistent rendered message
- Keep LLM-facing content unchanged — only TUI display changes
- Support collapsed (compact summary) and expanded (details) views

**Non-Goals:**
- Changing the content or format of messages sent to the LLM
- Adding new message types or new injection points
- Modifying `supi-core`'s `pruneAndReorderContextMessages` behavior

## Decisions

### Decision 1: Set `display: true` on both message types

Both `supi-claude-md-refresh` and `lsp-context` messages will change from `display: false` to `display: true`. This makes them visible in the TUI conversation flow. Without `display: true`, `registerMessageRenderer` has no effect — pi skips rendering entirely for `display: false` messages.

**Alternatives considered:**
- Keep `display: false` and add a separate `sendMessage` with `display: true` — rejected because it would double the context injection (two messages per event)
- Use `appendEntry` for TUI display only — rejected because `appendEntry` entries don't support custom renderers and are not visible in conversation flow

### Decision 2: Collapsed by default, expandable with details

Renderers will show a compact one-line summary by default. When expanded (toggled in the TUI), they reveal additional details from `message.details`.

- `supi-claude-md-refresh`: Collapsed shows `📄 CLAUDE.md refreshed (3 files)`. Expanded shows file paths and context token.
- `lsp-context`: Collapsed shows `🔧 LSP diagnostics injected (2 errors, 5 warnings)`. Expanded shows per-file breakdown and severity threshold.

**Rationale:** Context injection messages are frequent (every prompt when diagnostics exist). Compact collapsed views don't clutter the conversation; expanded views are available on demand.

### Decision 3: Replace LSP `notify()` with rendered message

The `ctx.ui.notify()` call in `supi-lsp` after diagnostics injection will be removed. The rendered message itself serves as the persistent notification — users can see it in the conversation flow and expand for details.

**Alternatives considered:**
- Keep both `notify()` and rendered message — rejected because it doubles the visual feedback for the same event
- Keep `notify()` and don't render the message — rejected because notify fades and leaves no persistent record

### Decision 4: Use `Box` + `Text` from `pi-tui`

Renderers will use `Box` with `customMessageBg` theme color and `Text` for content, following the pattern from pi's `message-renderer.ts` example. This provides consistent background styling with other custom messages.

### Decision 5: Renderer registration in each package's entry point

Each package registers its own renderer in its main extension function (alongside existing `before_agent_start` handlers). No new shared module needed — the renderers are package-specific and use data from their respective `details` shapes.

## Risks / Trade-offs

- **Token cost visibility**: Users may be surprised by how much context is injected on each prompt. → This is a *benefit* — transparency helps users understand token usage and opt out via settings.
- **Slightly different `details` shape in the future**: Renderers depend on `message.details` shapes that are internal to each package. → These shapes are already versioned alongside the package. Document the expected shape in the renderer code.
- **LSP notify removal**: Users accustomed to the transient notification may miss it initially. → The persistent rendered message is a strict upgrade — same info, but permanent and expandable.