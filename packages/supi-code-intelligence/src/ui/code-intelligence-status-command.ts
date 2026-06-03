// Code Intelligence status command — toggleable center dialog with persistent
// status bar, custom footer, and below-editor widget for LSP + structural awareness.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import type { OutstandingDiagnosticSummaryEntry, ProjectServerInfo } from "@mrclrchtr/supi-lsp/api";
import { getSessionLspService, type SessionLspService } from "@mrclrchtr/supi-lsp/api";
import { type CiStatusData, createCiStatusDialog } from "./code-intelligence-status-overlay.ts";

const STATUS_KEY = "code-intelligence";
const WIDGET_KEY = "code-intelligence";

interface InspectorState {
  handle: unknown;
  close: (() => void) | null;
}

const inspector: InspectorState = { handle: null, close: null };

/** Register the interactive /supi-ci-status overlay command. */
export function registerCiStatusCommand(pi: ExtensionAPI): void {
  pi.registerCommand("supi-ci-status", {
    description: "Toggle code intelligence status — LSP and structural analysis state",
    handler: async (_args: string, ctx: ExtensionContext) => {
      if (inspector.close) {
        inspector.close();
        return;
      }

      const dataRef = { current: await gatherCiStatusData(ctx.cwd, pi) };
      updateStatusAndWidget(ctx, dataRef.current);

      // Custom footer while overlay is open — reads latest data via ref
      ctx.ui.setFooter((_tui, _theme) => ({
        render(width: number): string[] {
          return [truncateFooterLine(renderFooterLine(ctx, dataRef.current), width)];
        },
        invalidate(): void {},
      }));

      void ctx.ui
        .custom<void>(
          (tui, theme, _kb, done) => {
            inspector.close = () => done(undefined);
            return createCiStatusDialog(dataRef.current, {
              theme:
                theme as unknown as import("./code-intelligence-status-overlay.ts").CiDialogTheme,
              done: () => done(undefined),
              tui,
              fetchDetailedDiagnostics: async (maxSeverity) => {
                const lspState = getSessionLspService(ctx.cwd);
                if (lspState.kind !== "ready") return [];
                return lspState.service.getOutstandingDiagnostics(maxSeverity);
              },
              onRefresh: async () => {
                const fresh = await gatherCiStatusData(ctx.cwd, pi);
                dataRef.current = fresh;
                updateStatusAndWidget(ctx, fresh);
                return fresh;
              },
            });
          },
          {
            overlay: true,
            overlayOptions: {
              anchor: "center",
              width: "66%",
              minWidth: 60,
              maxHeight: "85%",
              visible: (termWidth: number) => termWidth >= 60,
            },
            onHandle: (handle) => {
              inspector.handle = handle;
            },
          },
        )
        .finally(() => {
          inspector.handle = null;
          inspector.close = null;
          clearStatusAndWidget(ctx);
          ctx.ui.setFooter(undefined);
        });
    },
  });
}

/** Gather a snapshot of LSP and structural state for the dialog. */
async function gatherCiStatusData(cwd: string, pi: ExtensionAPI): Promise<CiStatusData> {
  const workspace = getDefaultWorkspaceRuntime().getWorkspace(cwd);
  const lspState = getSessionLspService(cwd);

  let servers: ProjectServerInfo[] = [];
  let diagnostics: OutstandingDiagnosticSummaryEntry[] = [];
  let semanticKind = "unavailable";
  let semanticReason: string | undefined;
  let semanticProviderAvailable = false;

  if (lspState.kind === "ready") {
    const service: SessionLspService = lspState.service;
    servers = service.getProjectServers();
    diagnostics = service.getOutstandingDiagnosticSummary(1);
    semanticKind = "ready";
    semanticProviderAvailable = true;
  } else if (lspState.kind === "pending") {
    semanticKind = "pending";
  } else if (lspState.kind === "inactive") {
    semanticKind = "inactive";
  } else if (lspState.kind === "disabled") {
    semanticKind = "disabled";
    semanticReason = "LSP is disabled in settings";
  } else {
    semanticKind = "unavailable";
    semanticReason = lspState.reason;
  }

  // Sort: errors desc, warnings desc, info desc, hints desc
  diagnostics.sort((a, b) => {
    if (b.errors !== a.errors) return b.errors - a.errors;
    if (b.warnings !== a.warnings) return b.warnings - a.warnings;
    if (b.information !== a.information) return b.information - a.information;
    return b.hints - a.hints;
  });

  const structState = workspace.structural.state;
  const structKind = structState.kind;
  const structReason = structState.kind === "unavailable" ? structState.reason : undefined;

  const activeTools = pi.getActiveTools().filter((t) => t.startsWith("code_"));

  return {
    servers,
    diagnostics,
    capabilities: {
      semantic: {
        kind: semanticKind,
        reason: semanticReason,
        providerAvailable: semanticProviderAvailable,
      },
      structural: {
        kind: structKind,
        reason: structReason,
        providerAvailable: structState.kind === "ready",
      },
      refactorAvailable: workspace.semantic.refactorAvailable,
    },
    activeTools,
  };
}

/** Render the custom footer line. */
function renderFooterLine(ctx: ExtensionContext, data: CiStatusData): string {
  const t = ctx.ui.theme;
  const parts: string[] = [];
  const running = data.servers.filter((s) => s.status === "running").length;
  if (running > 0) {
    parts.push(
      t.fg("accent", "λ ci") + t.fg("dim", ` ${running} server${running === 1 ? "" : "s"}`),
    );
  }
  const totalErrors = data.diagnostics.reduce((sum, d) => sum + d.errors, 0);
  if (totalErrors > 0) {
    parts.push(t.fg("error", `${totalErrors} error${totalErrors === 1 ? "" : "s"}`));
  }
  const totalWarnings = data.diagnostics.reduce((sum, d) => sum + d.warnings, 0);
  if (totalWarnings > 0) {
    parts.push(t.fg("warning", `${totalWarnings} warning${totalWarnings === 1 ? "" : "s"}`));
  }
  const structKind = data.capabilities.structural.kind;
  if (structKind === "ready") parts.push(t.fg("success", "✓ ts"));
  if (parts.length === 0) return t.fg("dim", "CI — no data available");
  return parts.join(t.fg("dim", "  "));
}

function truncateFooterLine(line: string, width: number): string {
  return truncateToWidth(line, width, "…");
}

/** Update the persistent status bar and below-editor widget. */
function updateStatusAndWidget(ctx: ExtensionContext, data: CiStatusData): void {
  const t = ctx.ui.theme;

  // Status bar: concise one-liner
  const parts: string[] = [t.fg("accent", "λ ci")];
  const runningServers = data.servers.filter((s) => s.status === "running").length;
  if (runningServers > 0) {
    parts.push(t.fg("dim", `${runningServers} server${runningServers === 1 ? "" : "s"}`));
  }
  const totalErrors = data.diagnostics.reduce((sum, d) => sum + d.errors, 0);
  if (totalErrors > 0) {
    parts.push(t.fg("error", `${totalErrors} error${totalErrors === 1 ? "" : "s"}`));
  }
  const totalWarnings = data.diagnostics.reduce((sum, d) => sum + d.warnings, 0);
  if (totalWarnings > 0) {
    parts.push(t.fg("warning", `${totalWarnings} warning${totalWarnings === 1 ? "" : "s"}`));
  }
  const structKind = data.capabilities.structural.kind;
  if (structKind === "ready") parts.push(t.fg("success", "✓ ts"));

  const statusText = parts.length > 1 ? parts.join(t.fg("dim", " · ")) : undefined;
  ctx.ui.setStatus(STATUS_KEY, statusText);

  // Widget (below editor) — top problem files
  if (data.diagnostics.length > 0) {
    const top = data.diagnostics.slice(0, 2);
    const fileLines = top.map((d) => {
      const counts: string[] = [];
      if (d.errors > 0) {
        counts.push(t.fg("error", `${d.errors} error${d.errors === 1 ? "" : "s"}`));
      }
      if (d.warnings > 0) {
        counts.push(t.fg("warning", `${d.warnings} warning${d.warnings === 1 ? "" : "s"}`));
      }
      return `  ${d.file} (${counts.join(", ")})`;
    });
    const more = data.diagnostics.length - top.length;
    const moreSuffix = more > 0 ? t.fg("dim", ` +${more} more`) : "";
    ctx.ui.setWidget(
      WIDGET_KEY,
      [
        t.fg("accent", `λ CI — ${data.diagnostics.length} files with issues`) + moreSuffix,
        ...fileLines,
      ],
      { placement: "belowEditor" },
    );
  } else {
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  }
}

function clearStatusAndWidget(ctx: ExtensionContext): void {
  ctx.ui.setStatus(STATUS_KEY, undefined);
  ctx.ui.setWidget(WIDGET_KEY, undefined);
}
