/**
 * TUI renderer for code_health — renderCall + renderResult.
 */

import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { formatEvidenceBadge } from "@mrclrchtr/supi-code-runtime/api";
import type { CodeHealthToolParams } from "../../tool/execute-health.ts";

interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  details?: { type: string; data: Record<string, unknown> };
  isError?: boolean;
}

/** ── renderCall ────────────────────────────────────────────────────── */

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

/** ── renderResult ──────────────────────────────────────────────────── */

export function renderHealthResult(
  result: ToolResult,
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  _context: unknown,
): Container | Text {
  if (options.isPartial) {
    return new Text(theme.fg("warning", "Gathering workspace health…"), 0, 0);
  }

  const container = new Container();
  const data =
    result.details?.type === "health" ? (result.details.data as Record<string, unknown>) : null;
  const markdownText = result.content.find((c) => c.type === "text")?.text ?? "";

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

  if (data?.evidenceLists) {
    container.addChild(new Spacer(1));
    container.addChild(
      buildEvidenceSection(data.evidenceLists as Array<Record<string, unknown>>, theme),
    );
  }

  if (markdownText) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("dim", "▸ raw markdown"), 0, 0));
    container.addChild(new Markdown(markdownText, 0, 0, getMarkdownTheme()));
  }

  return container;
}

/** ── Helpers ───────────────────────────────────────────────────────── */

function buildCompactSummary(data: Record<string, unknown> | null, theme: Theme): Text {
  if (!data) {
    return new Text(theme.fg("dim", "No health data"), 0, 0);
  }

  const diagCount = (data.diagnosticFileCount as number) ?? 0;
  const serverCount = (data.serverCount as number) ?? 0;
  const lspStatus = (data.lspStatus as string) ?? "unknown";

  const parts: string[] = [];
  parts.push(theme.fg("success", `${diagCount} files with issues`));
  parts.push(theme.fg("muted", `${serverCount} servers`));

  const statusColor = lspStatus === "ready" ? "success" : "warning";
  parts.push(theme.fg(statusColor, lspStatus));

  return new Text(parts.join("  "), 0, 0);
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

  return new Text(theme.fg("warning", badge), 0, 0);
}

function buildEvidenceSection(
  evidenceLists: Array<Record<string, unknown>>,
  theme: Theme,
): Container {
  const container = new Container();

  for (const ev of evidenceLists) {
    const label = String(ev.key ?? "files");
    const badge = formatEvidenceBadge({
      shownCount: Number(ev.shownCount ?? 0),
      totalCount: ev.totalCount != null ? Number(ev.totalCount) : null,
      omittedCount: ev.omittedCount != null ? Number(ev.omittedCount) : null,
      partialReason: typeof ev.partialReason === "string" ? ev.partialReason : null,
      label,
    });
    container.addChild(new Text(theme.fg("muted", badge), 0, 0));
  }

  return container;
}
