import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { OverlayHandle } from "@mariozechner/pi-tui";
import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import type { LspManager } from "./manager.ts";
import type { OutstandingDiagnosticSummaryEntry } from "./manager-types.ts";
import type { ProjectServerInfo } from "./types.ts";

export interface LspInspectorState {
  handle: OverlayHandle | null;
  close: (() => void) | null;
}

export function updateLspUi(
  ctx: ExtensionContext,
  manager: LspManager,
  inlineSeverity: number,
  servers: ProjectServerInfo[],
): void {
  const diagnostics = manager.getOutstandingDiagnosticSummary(inlineSeverity);

  ctx.ui.setStatus("lsp", buildLspStatus(ctx, servers, diagnostics));
  ctx.ui.setWidget(
    "lsp",
    hasWidgetContent(diagnostics)
      ? (_tui, theme) => buildLspWidgetComponent(theme, diagnostics)
      : undefined,
    { placement: "belowEditor" },
  );
}

// biome-ignore lint/complexity/useMaxParams: overlay inputs travel together
export function toggleLspStatusOverlay(
  ctx: ExtensionContext,
  manager: LspManager,
  inlineSeverity: number,
  inspector: LspInspectorState,
  servers: ProjectServerInfo[],
): void {
  if (inspector.handle && inspector.close) {
    inspector.close();
    return;
  }

  void ctx.ui
    .custom<void>(
      (_tui, theme, _kb, done) => {
        inspector.close = () => done(undefined);
        return createLspInspectorComponent(theme, manager, inlineSeverity, servers);
      },
      {
        overlay: true,
        overlayOptions: {
          anchor: "right-center",
          width: 64,
          maxHeight: "75%",
          margin: { right: 1, top: 1, bottom: 1 },
          nonCapturing: true,
        },
        onHandle: (handle) => {
          inspector.handle = handle;
        },
      },
    )
    .finally(() => {
      inspector.handle = null;
      inspector.close = null;
    });
}

function createLspInspectorComponent(
  theme: ExtensionContext["ui"]["theme"],
  manager: LspManager,
  inlineSeverity: number,
  servers: ProjectServerInfo[],
): { render: (width: number) => string[]; invalidate: () => void } {
  return {
    render: (width) =>
      buildLspInspectorContainer(theme, manager, inlineSeverity, servers).render(width),
    invalidate: () => {},
  };
}

function buildLspInspectorContainer(
  theme: ExtensionContext["ui"]["theme"],
  manager: LspManager,
  inlineSeverity: number,
  servers: ProjectServerInfo[],
): Container {
  const diagnostics = manager.getOutstandingDiagnosticSummary(inlineSeverity);
  const container = new Container();

  container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
  container.addChild(
    new Text(
      theme.fg("accent", theme.bold(" λ LSP")) + theme.fg("dim", " inspector  /lsp-status toggles"),
      1,
      0,
    ),
  );

  if (servers.length === 0 && diagnostics.length === 0) {
    container.addChild(
      new Text(theme.fg("dim", "no LSP servers available for this project"), 1, 0),
    );
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    return container;
  }

  container.addChild(new Text(buildOverlaySummaryLine(theme, servers, diagnostics), 1, 0));
  container.addChild(new Spacer(1));
  container.addChild(
    buildOverlaySection(theme, "Servers", buildOverlayServerLines(theme, servers)),
  );
  container.addChild(new Spacer(1));
  container.addChild(
    buildOverlaySection(
      theme,
      diagnostics.length > 0 ? "Problems" : "Diagnostics",
      buildOverlayDiagnosticLines(theme, diagnostics),
    ),
  );
  container.addChild(new Spacer(1));
  container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

  return container;
}

function buildLspStatus(
  ctx: ExtensionContext,
  servers: ProjectServerInfo[],
  diagnostics: OutstandingDiagnosticSummaryEntry[],
): string | undefined {
  const runningServers = servers.filter((server) => server.status === "running").length;
  const openFiles = servers.reduce((sum, server) => sum + server.openFiles.length, 0);
  const totals = collectDiagnosticTotals(diagnostics);

  if (runningServers === 0 && openFiles === 0 && diagnostics.length === 0) {
    return undefined;
  }

  const { theme } = ctx.ui;
  const parts = [theme.fg("accent", "λ lsp")];
  if (runningServers > 0) parts.push(theme.fg("dim", pluralize(runningServers, "server")));
  if (openFiles > 0) parts.push(theme.fg("dim", pluralize(openFiles, "open file")));
  if (totals.errors > 0) parts.push(theme.fg("error", pluralize(totals.errors, "error")));
  if (totals.warnings > 0) parts.push(theme.fg("warning", pluralize(totals.warnings, "warning")));
  if (totals.information > 0) parts.push(theme.fg("accent", pluralize(totals.information, "info")));
  if (totals.hints > 0) parts.push(theme.fg("dim", pluralize(totals.hints, "hint")));
  return parts.join(theme.fg("dim", " • "));
}

function hasWidgetContent(diagnostics: OutstandingDiagnosticSummaryEntry[]): boolean {
  return diagnostics.length > 0;
}

function buildLspWidgetComponent(
  theme: ExtensionContext["ui"]["theme"],
  diagnostics: OutstandingDiagnosticSummaryEntry[],
): Container {
  const container = new Container();

  for (const line of buildWidgetDiagnosticLines(theme, diagnostics)) {
    container.addChild(new Text(line, 0, 0));
  }

  return container;
}

function buildWidgetDiagnosticLines(
  theme: ExtensionContext["ui"]["theme"],
  diagnostics: OutstandingDiagnosticSummaryEntry[],
): string[] {
  if (diagnostics.length === 1) {
    const [entry] = diagnostics;
    if (!entry) return [];
    return [
      `${theme.fg("error", "●")} ${entry.file} ${theme.fg("dim", `— ${formatDiagnosticCounts(entry)}`)}`,
    ];
  }

  const totals = collectDiagnosticTotals(diagnostics);
  const counts: string[] = [];
  if (totals.errors > 0) counts.push(theme.fg("error", pluralize(totals.errors, "error")));
  if (totals.warnings > 0) counts.push(theme.fg("warning", pluralize(totals.warnings, "warning")));
  if (totals.information > 0)
    counts.push(theme.fg("accent", pluralize(totals.information, "info")));
  if (totals.hints > 0) counts.push(theme.fg("dim", pluralize(totals.hints, "hint")));

  const visibleFiles = diagnostics.slice(0, 2).map((entry) => entry.file);
  const remaining = diagnostics.length - visibleFiles.length;
  const suffix = remaining > 0 ? `${theme.fg("dim", ` +${remaining} more`)}` : "";

  return [
    `${theme.fg("accent", theme.bold("λ LSP diagnostics"))} ${theme.fg("dim", `— ${pluralize(diagnostics.length, "file")}`)} ${counts.join(theme.fg("dim", " • "))}`,
    `${theme.fg("error", "↳")} ${visibleFiles.join(", ")}${suffix}`,
  ];
}

function buildOverlaySummaryLine(
  theme: ExtensionContext["ui"]["theme"],
  servers: ProjectServerInfo[],
  diagnostics: OutstandingDiagnosticSummaryEntry[],
): string {
  const runningServers = servers.filter((server) => server.status === "running").length;
  const openFiles = servers.reduce((sum, server) => sum + server.openFiles.length, 0);
  const totals = collectDiagnosticTotals(diagnostics);

  const parts = [
    theme.fg(
      "dim",
      `${pluralize(runningServers, "server")} • ${pluralize(openFiles, "open file")}`,
    ),
  ];
  if (totals.errors > 0) {
    parts.push(theme.fg("error", pluralize(totals.errors, "error")));
  } else if (totals.warnings > 0) {
    parts.push(theme.fg("warning", pluralize(totals.warnings, "warning")));
  } else if (totals.information > 0) {
    parts.push(theme.fg("accent", pluralize(totals.information, "info")));
  } else if (totals.hints > 0) {
    parts.push(theme.fg("dim", pluralize(totals.hints, "hint")));
  } else {
    parts.push(theme.fg("success", "clean"));
  }

  return parts.join(theme.fg("dim", "   "));
}

function buildOverlaySection(
  theme: ExtensionContext["ui"]["theme"],
  title: string,
  lines: string[],
): Container {
  const container = new Container();
  container.addChild(new Text(theme.fg("accent", theme.bold(` ${title}`)), 1, 0));
  for (const line of lines) {
    container.addChild(new Text(line, 2, 0));
  }
  return container;
}

function buildOverlayServerLines(
  theme: ExtensionContext["ui"]["theme"],
  servers: ProjectServerInfo[],
): string[] {
  if (servers.length === 0) {
    return [theme.fg("dim", "no LSP servers available for this project")];
  }

  return servers.flatMap((server) => {
    const statusColor =
      server.status === "running" ? "success" : server.status === "error" ? "error" : "warning";
    const actions =
      server.supportedActions.length > 0 ? server.supportedActions.join(", ") : "none";
    const fileTypes = server.fileTypes.map((entry) => `.${entry}`).join(", ");
    const openFiles =
      server.openFiles.length > 0 ? server.openFiles.slice(0, 2).join(", ") : "none";
    const remaining = server.openFiles.length - Math.min(server.openFiles.length, 2);
    const suffix = remaining > 0 ? theme.fg("dim", ` +${remaining} more`) : "";

    return [
      `${theme.fg("accent", "◆")} ${server.name} ${theme.fg(statusColor, server.status)} ${theme.fg("dim", `— root: ${server.root}`)}`,
      `${theme.fg("dim", "↳")} files: ${fileTypes}`,
      `${theme.fg("dim", "↳")} actions: ${actions}`,
      `${theme.fg("dim", "↳")} open: ${openFiles}${suffix}`,
    ];
  });
}

function buildOverlayDiagnosticLines(
  theme: ExtensionContext["ui"]["theme"],
  diagnostics: OutstandingDiagnosticSummaryEntry[],
): string[] {
  if (diagnostics.length === 0) {
    return [theme.fg("success", "✓ no outstanding diagnostics")];
  }

  const lines = diagnostics
    .slice(0, 5)
    .map(
      (entry) =>
        `${theme.fg("error", "●")} ${entry.file} ${theme.fg("dim", `— ${formatDiagnosticCounts(entry)}`)}`,
    );

  const remainingDiagnostics = diagnostics.length - Math.min(diagnostics.length, 5);
  if (remainingDiagnostics > 0) {
    lines.push(
      theme.fg(
        "dim",
        `↳ +${remainingDiagnostics} more diagnostic file${remainingDiagnostics === 1 ? "" : "s"}`,
      ),
    );
  }

  return lines;
}

function formatDiagnosticCounts(entry: OutstandingDiagnosticSummaryEntry): string {
  const counts: string[] = [];
  if (entry.errors > 0) counts.push(pluralize(entry.errors, "error"));
  if (entry.warnings > 0) counts.push(pluralize(entry.warnings, "warning"));
  if (entry.information > 0) counts.push(pluralize(entry.information, "info"));
  if (entry.hints > 0) counts.push(pluralize(entry.hints, "hint"));
  return counts.join(", ");
}

function collectDiagnosticTotals(
  diagnostics: OutstandingDiagnosticSummaryEntry[],
): Pick<OutstandingDiagnosticSummaryEntry, "errors" | "warnings" | "information" | "hints"> {
  return diagnostics.reduce(
    (totals, entry) => ({
      errors: totals.errors + entry.errors,
      warnings: totals.warnings + entry.warnings,
      information: totals.information + entry.information,
      hints: totals.hints + entry.hints,
    }),
    { errors: 0, warnings: 0, information: 0, hints: 0 },
  );
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
