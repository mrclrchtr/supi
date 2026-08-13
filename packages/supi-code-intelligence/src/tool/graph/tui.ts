/** TUI renderer for code_graph. */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import {
  buildSimpleCompact,
  buildSimpleHeader,
  type EvidenceEntry,
  formatCallPath,
  formatCallValue,
  type ResultOptios,
  renderDomainError,
  renderDomainResult,
  renderEvidenceLines,
  renderExecutionError,
  renderMarkdownDetail,
  renderPartial,
  renderStructuredDetailBody,
  renderToolDisplaySections,
  renderTruncationDisclosure,
  type ToolRendererContext,
  type ToolResult,
} from "../../ui/tui/common.ts";
import type { CodeGraphToolParams, GraphRelation } from "./execute.ts";

/** Render the compact code_graph call header. */
export function renderGraphCall(
  args: unknown,
  theme: Theme,
  _context: ToolRendererContext | undefined,
): Text {
  const params = (args ?? {}) as Partial<CodeGraphToolParams>;
  const relations: GraphRelation[] = Array.isArray(params.relations)
    ? (params.relations as GraphRelation[])
    : ["references"];
  const relationLabel = formatRelations(relations);

  let content = theme.fg("toolTitle", "code_graph");
  if (relationLabel) content += ` ${theme.fg("accent", relationLabel)}`;

  const target = formatTarget(params.target);
  if (target) content += ` ${theme.fg("muted", target)}`;

  return new Text(content, 0, 0);
}

/** Render code_graph progress, status, and structured result details. */
export function renderGraphResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  context: ToolRendererContext | undefined,
): Container | Text {
  if (options.isPartial) return renderPartial("Collecting relations…", theme);

  const details =
    result.details?.type === "search" ? (result.details.data as Record<string, unknown>) : null;
  const executionError = renderExecutionError(context, "code_graph failed", theme);
  if (executionError) return executionError;
  const domainError = renderDomainError(result, theme);
  if (domainError) return renderDomainResult(result, options, theme, domainError);

  if (!options.expanded) {
    const compact = buildSimpleCompact(details ?? undefined, theme);
    const truncation = renderTruncationDisclosure(result, theme);
    if (!truncation) return compact;
    const container = new Container();
    container.addChild(compact);
    container.addChild(new Spacer(1));
    container.addChild(truncation);
    return container;
  }

  const container = new Container();
  const header = buildSimpleHeader(details ?? undefined, theme);
  if (header) container.addChild(header);

  const evidenceLists = details?.evidenceLists as EvidenceEntry[] | undefined;
  if (evidenceLists && evidenceLists.length > 0) {
    container.addChild(new Spacer(1));
    renderEvidenceLines(container, evidenceLists, theme);
  }

  renderToolDisplaySections(container, result.details?.displaySections, theme);
  renderStructuredDetailBody(container, details ?? undefined, theme);
  const truncation = renderTruncationDisclosure(result, theme);
  if (truncation) {
    container.addChild(new Spacer(1));
    container.addChild(truncation);
  }
  renderMarkdownDetail(container, result, theme);
  return container;
}

function formatRelations(relations: readonly GraphRelation[]): string {
  if (relations.length === 0) return "";
  if (relations.length === 1) return `→ ${relations[0]}`;
  if (relations.length <= 3) return `→ ${relations.join(", ")}`;
  return `→ ${relations.slice(0, 2).join(", ")} +${relations.length - 2}`;
}

function formatTarget(target: unknown): string {
  if (!target || typeof target !== "object") return "";
  const record = target as Record<string, unknown>;

  if (record.symbol && typeof record.symbol === "object") {
    const query = formatCallValue((record.symbol as Record<string, unknown>).query);
    return query ? `of ${query}` : "";
  }
  if (record.anchor && typeof record.anchor === "object") {
    const anchor = record.anchor as Record<string, unknown>;
    const file = formatCallPath(anchor.file);
    const line = typeof anchor.line === "number" ? `:${anchor.line}` : "";
    return file ? `at ${file}${line}` : "";
  }
  const handle = formatCallValue(record.handle);
  return handle ? `of ${handle}` : "";
}
