/**
 * TUI renderer for code_health — renderCall + renderResult.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { formatEvidenceBadge } from "@mrclrchtr/supi-code-runtime/api";
import type { CodeHealthToolParams } from "../../tool/execute-health.ts";
import {
  type EvidenceEntry,
  type ResultOptios,
  renderEvidenceLines,
  renderMarkdownDetail,
  renderPartial,
  type ToolResult,
} from "./common.ts";

/** ── renderCall ────────────────────────────────────────────────── */

export function renderHealthCall(args: unknown, theme: Theme, _context: unknown): Text {
  const params = (args ?? {}) as CodeHealthToolParams;
  const sections = params.include?.length ? params.include.join(", ") : "diag, servers";

  let content = theme.fg("toolTitle", "code_health");
  content += ` ${theme.fg("accent", sections)}`;

  if (params.scope) {
    content += ` ${theme.fg("dim", params.scope)}`;
  }

  return new Text(content, 0, 0);
}

/** ── renderResult ──────────────────────────────────────────────── */

export function renderHealthResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  _context: unknown,
): Container | Text {
  if (options.isPartial) {
    return renderPartial("Gathering workspace health…", theme);
  }

  const container = new Container();
  const data =
    result.details?.type === "health" ? (result.details.data as Record<string, unknown>) : null;

  if (result.isError) {
    container.addChild(new Text(theme.fg("error", "code_health failed"), 0, 0));
    return container;
  }

  if (!options.expanded) {
    container.addChild(buildCompactSummary(data, theme));
    return container;
  }

  // Expanded view
  container.addChild(buildStatusBar(data, theme));
  container.addChild(new Spacer(1));
  container.addChild(buildDiagnosticSummary(data, theme));

  const lists = data?.evidenceLists as EvidenceEntry[] | undefined;
  if (lists && lists.length > 0) {
    container.addChild(new Spacer(1));
    renderEvidenceLines(container, lists, theme);
  }

  renderMarkdownDetail(container, result, theme);

  return container;
}

/** ── Helpers ───────────────────────────────────────────────────── */

function buildCompactSummary(data: Record<string, unknown> | null, theme: Theme): Text {
  if (!data) {
    return new Text(theme.fg("dim", "No health data"), 0, 0);
  }

  const diagCount = (data.diagnosticFileCount as number) ?? 0;
  const serverCount = (data.serverCount as number) ?? 0;
  const lspStatus = (data.lspStatus as string) ?? "unknown";

  const statusColor = lspStatus === "ready" ? "success" : "warning";
  const dot = theme.fg("dim", "·");

  const segments = [
    `${theme.fg("dim", "diag")} ${theme.fg("success", theme.bold(`${diagCount}`))}${theme.fg("muted", " with issues")}`,
    `${theme.fg("dim", "servers")} ${theme.fg("muted", `${serverCount}`)}`,
    `${theme.fg("dim", "lsp")} ${theme.fg(statusColor, lspStatus)}`,
  ];

  return new Text(segments.join(` ${dot} `), 0, 0);
}

function buildStatusBar(data: Record<string, unknown> | null, theme: Theme): Text {
  if (!data) return new Text("", 0, 0);

  const lspStatus = (data.lspStatus as string) ?? "unknown";
  const structuralStatus = (data.structuralStatus as string) ?? "unknown";
  const recovered = data.recovered;

  const lspColor = lspStatus.startsWith("ready") ? "success" : "warning";
  const structuralColor = structuralStatus === "ready" ? "success" : "muted";

  const lspLabel =
    lspStatus.includes("(recovered)") || !recovered ? lspStatus : `${lspStatus} (recovered)`;

  const lines: string[] = [
    `LSP: ${theme.fg(lspColor, lspLabel)}`,
    `Tree-sitter: ${theme.fg(structuralColor, structuralStatus)}`,
  ];

  return new Text(lines.join("  "), 0, 0);
}

function buildDiagnosticSummary(data: Record<string, unknown> | null, theme: Theme): Text {
  if (!data) return new Text("", 0, 0);

  const diagCount = (data.diagnosticFileCount as number) ?? 0;
  if (diagCount === 0) {
    return new Text(theme.fg("success", "No diagnostics found"), 0, 0);
  }

  const badge = formatEvidenceBadge({
    shownCount: diagCount,
    totalCount: diagCount,
    omittedCount: 0,
    partialReason: null,
    label: "files with issues",
  });

  return new Text(theme.fg("warning", theme.bold(badge)), 0, 0);
}
