## Plan: Code Intelligence Status Dialog

Restore a proper TUI overlay for `/ci-status` — a centered dialog (66% width) with unified LSP + Tree-sitter status, expandable per-file diagnostics, and persistent status bar + below-editor widget.

### File map

| File | Responsibility |
|------|----------------|
| `packages/supi-code-intelligence/src/ui/code-intelligence-status-overlay.ts` | **New** — `CiStatusDialog` class (Component), factory, data fetching helper. |
| `packages/supi-code-intelligence/src/ui/code-intelligence-status-command.ts` | **Update** — Replace `ctx.ui.notify` with overlay toggle; add status bar and widget. |
| `packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-command.test.ts` | **Update** — Test overlay creation, status bar, widget. |

Plus a new test file for the overlay component:
| `packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-overlay.test.ts` | **New** — Test dialog rendering and interaction. |

### Architecture

```
/ci-status command handler
  ├── on first call / no handle: fetch data → create dialog → ctx.ui.custom(overlay)
  ├── on second call with handle: close dialog → clear status/widget
  └── on dialog ESC: done() → clear status/widget

Data fetching (snapshot at open time):
  workspace ← getDefaultWorkspaceRuntime().getWorkspace(cwd)
  lspState ← getSessionLspService(cwd)
  if lspState.ready: servers ← service.getProjectServers()
                     diagSummary ← service.getOutstandingDiagnosticSummary(1)
  tools ← pi.getActiveTools().filter(t => t.startsWith("code_"))

CiStatusDialog (Component class):
  props: servers[], diagSummary[], capabilities, tools[]
  state: selectedFileIdx, expandedFileIdx | null
  render(): header → summary → Servers → Problems → Capabilities → Tools → footer
  handleInput(): ↑↓ navigate, Enter toggle expand, Esc done()
```

### Key implementation notes

- **DynamicBorder** surrounds the dialog (top/bottom). Rounded look via `DynamicBorder` with accent coloring.
- **Server rows**: status icon (✓/✗/?), name, root, file types, open files (top 3 + "+N more").
- **Expandable diagnostics**: single-expand mode. Enter on a file row fetches full diagnostics via `service.getOutstandingDiagnostics(1)`, renders up to 5 inline messages. Re-collapse with Enter again.
- **Caching**: Cache rendered output by width. `invalidate()` clears cache.
- **Theme discipline**: All colors via `theme.fg()` and `theme.bg()`, no hardcoded ANSI.
- **truncateToWidth**: Every line respects the width parameter.
- **Status bar**: `ctx.ui.setStatus("code-intelligence", "λ ci · N servers · N errors · ✓ ts")`. Cleared when no data.
- **Widget**: Below-editor, top-2 problem files with counts. Removed when clean.

### Edge cases handled

- No LSP session: skip servers/problems sections, show "unavailable" in capabilities
- LSP ready, no servers: "no configured language servers"
- No diagnostics: "✓ no issues" in success color
- Structural unavailable: show state + reason
- >15 problem files: truncate to 10 + "↳ +N more"
- Terminal <60 cols: dialog hidden via overlayOptions.visible
- Toggle: calling /ci-status twice closes the dialog
