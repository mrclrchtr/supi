/**
 * TUI renderer for code_graph — renderCall + renderResult.
 *
 * Dual-surface rendering: chrome built from details, markdown body
 * available as a collapsible detail view.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import {
  buildSimpleCompact,
  buildSimpleHeader,
  type EvidenceEntry,
  type ResultOptios,
  renderEvidenceLines,
  renderMarkdownDetail,
  renderPartial,
  type ToolResult,
} from "../../ui/tui/common.ts";
import type { CodeGraphToolParams, GraphRelation } from "./execute.ts";

/** ── renderCall ────────────────────────────────────────────────── */

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

/** ── renderResult ──────────────────────────────────────────────── */

export function renderGraphResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  _context: unknown,
): Container | Text {
  if (options.isPartial) {
    return renderPartial("Collecting relations…", theme);
  }

  const container = new Container();
  const details =
    result.details?.type === "search" ? (result.details.data as Record<string, unknown>) : null;

  if (result.isError) {
    container.addChild(new Text(theme.fg("error", "code_graph failed"), 0, 0));
    return container;
  }

  const omittedCount = (details?.omittedCount as number) ?? 0;

  if (!options.expanded) {
    container.addChild(buildSimpleCompact(details ?? undefined, theme, { omittedCount }));
    return container;
  }

  // Expanded view
  const header = buildSimpleHeader(details ?? undefined, theme, { omittedCount });
  if (header) container.addChild(header);

  const evidenceLists = details?.evidenceLists as EvidenceEntry[] | undefined;
  if (evidenceLists && evidenceLists.length > 0) {
    container.addChild(new Spacer(1));
    renderEvidenceLines(container, evidenceLists, theme);
  }

  if (details?.tests) {
    container.addChild(new Spacer(1));
    container.addChild(buildTestsSection(details.tests as Record<string, unknown>, theme));
  }

  renderMarkdownDetail(container, result, theme);

  return container;
}

/** ── Helpers ───────────────────────────────────────────────────── */

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
