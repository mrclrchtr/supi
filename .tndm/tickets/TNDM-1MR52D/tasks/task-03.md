# Task 3: Update /ci-status command to use overlay with status bar and widget

## Goal
Update `registerCiStatusCommand` in `packages/supi-code-intelligence/src/ui/code-intelligence-status-command.ts` to use the new overlay instead of `ctx.ui.notify`, and add persistent status bar + widget updates.

## Current state
The handler currently calls `ctx.ui.notify(lines.join("\n"), "info")` with a markdown status message.

## Required changes

### 1. Import the new overlay
```ts
import { createCiStatusDialog, type CiStatusData } from "./code-intelligence-status-overlay.ts";
import { getSessionLspService } from "@mrclrchtr/supi-lsp/api";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
```

### 2. Manage overlay handle (toggle pattern)
```ts
let activeHandle: { close: () => void } | null = null;
```

### 3. Data fetching function
Extract data gathering into a helper:
```ts
async function gatherCiStatusData(cwd: string, pi: ExtensionAPI): Promise<CiStatusData>
```
- Gets workspace state from `getDefaultWorkspaceRuntime().getWorkspace(cwd)`
- Gets LSP state from `getSessionLspService(cwd)`
- If LSP ready: servers from `service.getProjectServers()`, diagnostics from `service.getOutstandingDiagnosticSummary(1)`
- If LSP not ready: empty servers/diagnostics, semantic capability reflects state
- Structural capability from `workspace.structural.state`
- Active tools from `pi.getActiveTools().filter(t => t.startsWith("code_"))`

### 4. Overlay toggle in handler
```ts
if (activeHandle) {
  activeHandle.close();
  activeHandle = null;
  clearStatusAndWidget(ctx);
  return;
}

const data = await gatherCiStatusData(ctx.cwd, pi);
updateStatusAndWidget(ctx, data);

await ctx.ui.custom<void>((tui, theme, _kb, done) => {
  activeHandle = { close: () => done(undefined) };
  return createCiStatusDialog(data, theme, () => {
    activeHandle = null;
    clearStatusAndWidget(ctx);
    done(undefined);
  }, tui);
}, {
  overlay: true,
  overlayOptions: {
    anchor: "center",
    width: "66%",
    minWidth: 60,
    maxHeight: "85%",
    visible: (w: number) => w >= 60,
  },
});
```

### 5. Status bar widget
```ts
function updateStatusAndWidget(ctx: ExtensionContext, data: CiStatusData): void {
  // Status bar
  const parts: string[] = [ctx.ui.theme.fg("accent", "λ ci")];
  const runningServers = data.servers.filter(s => s.status === "running").length;
  if (runningServers > 0) parts.push(ctx.ui.theme.fg("dim", `${runningServers} servers`));
  // ... error/warning counts
  const structState = data.capabilities.structural.kind;
  if (structState === "ready") parts.push(ctx.ui.theme.fg("success", "✓ ts"));

  ctx.ui.setStatus("code-intelligence", parts.join(" · "));

  // Widget (below editor) — top 2 problem files
  if (data.diagnostics.length > 0) {
    const top = data.diagnostics.slice(0, 2);
    const lines = top.map(d => {
      const counts: string[] = [];
      if (d.errors > 0) counts.push(ctx.ui.theme.fg("error", `${d.errors} errors`));
      if (d.warnings > 0) counts.push(ctx.ui.theme.fg("warning", `${d.warnings} warnings`));
      return `${d.file} (${counts.join(", ")})`;
    });
    const suffix = data.diagnostics.length > 2 ? ` +${data.diagnostics.length - 2} more` : "";
    ctx.ui.setWidget("code-intelligence", [
      ctx.ui.theme.fg("accent", `λ CI — ${data.diagnostics.length} files with issues`) + ctx.ui.theme.fg("dim", suffix),
      ...lines.map(l => `  ${l}`),
    ], { placement: "belowEditor" });
  } else {
    ctx.ui.setWidget("code-intelligence", undefined);
  }
}

function clearStatusAndWidget(ctx: ExtensionContext): void {
  ctx.ui.setStatus("code-intelligence", undefined);
  ctx.ui.setWidget("code-intelligence", undefined);
}
```

### 6. Remove the old notify-based rendering
Delete the manual `lines` array building and `ctx.ui.notify()` call.

## Test changes
Update `code-intelligence-status-command.test.ts`:
- Import `getSessionLspService` mock setup
- Test that command creates an overlay (verify `ctx.ui.custom` called with overlay options)
- Test that status bar is set with server/diagnostic info
- Test that widget is set when diagnostics exist
- Test that widget is cleared when no diagnostics
- Test toggle: second invocation closes the overlay
- Test that `ctx.ui.notify` is NOT called

## Verification
- Run: `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-command.test.ts`
- All tests PASS
- Run: `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`
- No type errors
