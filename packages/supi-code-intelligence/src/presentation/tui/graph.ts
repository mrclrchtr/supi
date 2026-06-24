/**
 * TUI renderer for code_graph — renderCall + renderResult.
 *
 * Dual-surface rendering: chrome built from details, markdown body
 * available as a collapsible detail view.
 */

import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { formatEvidenceBadge } from "@mrclrchtr/supi-code-runtime/api";
import type { CodeGraphToolParams, GraphRelation } from "../../tool/execute-graph.ts";

/** pi ToolDefinition renderResult */
interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  details?: { type: string; data: Record<string, unknown> };
  isError?: boolean;
}

/** ── renderCall ────────────────────────────────────────────────────── */

export function renderGraphCall(args: unknown, theme: Theme, _context: unknown): Text {
  const params = (args ?? {}) as CodeGraphToolParams;
  const relations = params.relations ?? ["references"];
  const relationLabel = formatRelations(relations);

  let content = theme.fg("toolTitle", "code_graph");

  if (relationLabel) {
    content += ` ${theme.fg("accent", relationLabel)}`;
  }

  const target = formatTarget(params);
  if (target) {
    content += ` ${theme.fg("muted", target)}`;
  }

  return new Text(content, 0, 0);
}

/** ── renderResult ──────────────────────────────────────────────────── */

export function renderGraphResult(
  result: ToolResult,
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  _context: unknown,
): Container | Text {
  if (options.isPartial) {
    return new Text(theme.fg("warning", "Collecting relations…"), 0, 0);
  }

  const container = new Container();
  const details =
    result.details?.type === "search" ? (result.details.data as Record<string, unknown>) : null;
  const markdownText = result.content.find((c) => c.type === "text")?.text ?? "";

  if (result.isError) {
    container.addChild(new Text(theme.fg("error", "code_graph failed"), 0, 0));
    return container;
  }

  if (!options.expanded) {
    container.addChild(buildCompactSummary(details, theme));
    return container;
  }

  // Expanded view
  container.addChild(buildSummaryHeader(details, theme));

  const evidenceLists = details?.evidenceLists as Array<Record<string, unknown>> | undefined;
  if (evidenceLists && evidenceLists.length > 0) {
    container.addChild(new Spacer(1));
    container.addChild(buildEvidenceSection(evidenceLists, theme));
  }

  if (details?.tests) {
    container.addChild(new Spacer(1));
    container.addChild(buildTestsSection(details.tests as Record<string, unknown>, theme));
  }

  if (markdownText) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("dim", "▸ raw markdown"), 0, 0));
    container.addChild(new Markdown(markdownText, 0, 0, getMarkdownTheme()));
  }

  return container;
}

/** ── Helpers ───────────────────────────────────────────────────────── */

function formatRelations(relations: GraphRelation[]): string {
  if (relations.length === 0) return "";
  if (relations.length === 1) return `→ ${relations[0]}`;
  if (relations.length <= 3) return `→ ${relations.join(", ")}`;
  return `→ ${relations.slice(0, 2).join(", ")} +${relations.length - 2}`;
}

function formatTarget(params: CodeGraphToolParams): string {
  if (params.symbol) return `of ${params.symbol}`;
  if (params.file) {
    const file = params.file.split("/").pop() ?? params.file;
    if (params.line) return `at ${file}:${params.line}`;
    return `of ${file}`;
  }
  return "";
}

function buildCompactSummary(data: Record<string, unknown> | null, theme: Theme): Text {
  if (!data) {
    return new Text(theme.fg("dim", "No results"), 0, 0);
  }

  const candidateCount = (data.candidateCount as number) ?? 0;
  const omittedCount = (data.omittedCount as number) ?? 0;

  const badge = formatEvidenceBadge({
    shownCount: candidateCount,
    totalCount: candidateCount + omittedCount,
    omittedCount,
    partialReason: null,
    label: "results",
  });

  return new Text(theme.fg("success", badge), 0, 0);
}

function buildSummaryHeader(data: Record<string, unknown> | null, theme: Theme): Text {
  if (!data) {
    return new Text(theme.fg("dim", "No results"), 0, 0);
  }

  const candidateCount = (data.candidateCount as number) ?? 0;
  const omittedCount = (data.omittedCount as number) ?? 0;

  const badge = formatEvidenceBadge({
    shownCount: candidateCount,
    totalCount: candidateCount + omittedCount,
    omittedCount,
    partialReason: null,
    label: "results",
  });

  const confidence = (data.confidence as string) ?? "";
  const suffix = confidence ? theme.fg("dim", ` — ${confidence}`) : "";

  return new Text(`${theme.fg("accent", badge)}${suffix}`, 0, 0);
}

function buildEvidenceSection(
  evidenceLists: Array<Record<string, unknown>>,
  theme: Theme,
): Container {
  const container = new Container();

  for (const ev of evidenceLists) {
    const label = evidenceKeyToLabel(String(ev.key ?? ""));
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

function buildTestsSection(tests: Record<string, unknown>, theme: Theme): Text {
  const fileCount = (tests.files as Array<unknown> | undefined)?.length ?? 0;
  if (fileCount === 0) {
    return new Text(theme.fg("dim", "No companion test files found"), 0, 0);
  }
  return new Text(
    theme.fg("dim", `${fileCount} companion test file${fileCount !== 1 ? "s" : ""}`),
    0,
    0,
  );
}

function evidenceKeyToLabel(key: string): string {
  const labels: Record<string, string> = {
    "callees.calls": "calls",
    "exports.symbols": "exports",
    "find.astMatches": "AST matches",
    "find.semanticSymbols": "symbols",
    "find.textMatches": "matches",
    "health.dirtyFiles": "dirty files",
    "implements.locations": "implementations",
    "imports.modules": "imports",
    "inspect.codeActions": "code actions",
    "references.locations": "references",
    "refactor.edits": "edits",
    "resolve.candidates": "candidates",
    "resolve.targets": "targets",
  };
  return labels[key] ?? key;
}
