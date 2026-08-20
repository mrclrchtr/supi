/** TUI renderer for code_orientation. */
import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import {
  type EvidenceEntry,
  formatCallPath,
  formatCallValue,
  formatEvidenceEntry,
  type ResultOptios,
  readEvidenceEntries,
  renderDomainError,
  renderDomainResult,
  renderExecutionError,
  renderPartial,
  renderStructuredDetailBody,
  renderToolDisplaySections,
  renderTruncationDisclosure,
  type ToolRendererContext,
  type ToolResult,
} from "../../ui/tui/common.ts";
import type { CodeOrientationToolParams } from "./execute.ts";

/** Render the compact code_orientation call header. */
export function renderOrientationCall(
  args: unknown,
  theme: Theme,
  _context: ToolRendererContext | undefined,
): Text {
  const params = (args ?? {}) as Partial<CodeOrientationToolParams>;
  let content = theme.fg("toolTitle", "code_orientation");
  const focus = params.focus;

  if (!focus || typeof focus !== "object") {
    content += ` ${theme.fg("muted", "workspace")}`;
  } else if ("path" in focus) {
    const path = formatCallPath(focus.path);
    content += ` ${theme.fg("accent", path ?? "path?")}`;
  } else if ("module" in focus) {
    content += ` ${theme.fg("accent", formatCallValue(focus.module) ?? "module?")}`;
  } else if ("target" in focus) {
    content += ` ${theme.fg("accent", "target")}`;
  }

  return new Text(content, 0, 0);
}

/** Render code_orientation progress, status, and structured result details. */
export function renderOrientationResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  context: ToolRendererContext | undefined,
): Container | Text {
  if (options.isPartial) return renderPartial("Orienting…", theme);

  const data =
    result.details?.type === "context" ? (result.details.data as Record<string, unknown>) : null;
  const markdownText = result.content.find((c) => c.type === "text")?.text ?? "";

  const executionError = renderExecutionError(context, "code_orientation failed", theme);
  if (executionError) return executionError;
  const domainError = renderDomainError(result, theme);
  if (domainError) return renderDomainResult(result, options, theme, domainError);

  if (!options.expanded) {
    const compact = buildCompactSummary(data, theme);
    const truncation = renderTruncationDisclosure(result, theme);
    if (!truncation) return compact;
    const compactContainer = new Container();
    compactContainer.addChild(compact);
    compactContainer.addChild(new Spacer(1));
    compactContainer.addChild(truncation);
    return compactContainer;
  }

  const container = new Container();
  container.addChild(buildHeader(data, theme));

  const target = data?.target as Record<string, unknown> | undefined;
  if (target) {
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(
        theme.fg(
          "muted",
          `${formatCallValue(target.name) ?? "symbol"} — ${formatCallPath(target.file) ?? ""}:${String(target.displayLine ?? "")}`,
        ),
        0,
        0,
      ),
    );
  }

  renderToolDisplaySections(container, result.details?.displaySections, theme);
  renderStructuredDetailBody(container, data ?? undefined, theme);

  const truncation = renderTruncationDisclosure(result, theme);
  if (truncation) {
    container.addChild(new Spacer(1));
    container.addChild(truncation);
  }

  if (markdownText) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("dim", "▸ raw markdown"), 0, 0));
    container.addChild(new Markdown(markdownText, 0, 0, getMarkdownTheme()));
  }

  return container;
}

function buildCompactSummary(data: Record<string, unknown> | null, theme: Theme): Text {
  if (!data) return new Text(theme.fg("dim", "No orientation"), 0, 0);

  const segments = summarySegments(data, theme, "success");
  if (segments.length === 0) return new Text(theme.fg("dim", "No assembled evidence"), 0, 0);
  return new Text(segments.join(` ${theme.fg("dim", "·")} `), 0, 0);
}

function buildHeader(data: Record<string, unknown> | null, theme: Theme): Text {
  if (!data) return new Text("", 0, 0);
  return new Text(summarySegments(data, theme, "accent").join(` ${theme.fg("dim", "·")} `), 0, 0);
}

function summarySegments(
  data: Record<string, unknown>,
  theme: Theme,
  badgeColor: "accent" | "success",
): string[] {
  const segments: string[] = [];
  const evidence = orientationEvidence(data);
  if (evidence) segments.push(theme.fg(badgeColor, theme.bold(formatEvidenceEntry(evidence))));

  const confidence = typeof data.confidence === "string" ? data.confidence : "";
  if (confidence && confidence !== "unavailable") {
    segments.push(`${theme.fg("dim", "confidence")} ${theme.fg("muted", confidence)}`);
  }

  const target = data.target as Record<string, unknown> | undefined;
  const targetName = formatCallValue(target?.name);
  if (targetName) segments.push(theme.fg("muted", targetName));

  return segments;
}

function orientationEvidence(data: Record<string, unknown>): EvidenceEntry | null {
  const evidence = readEvidenceEntries(data.evidenceLists);
  return evidence.find((entry) => entry.shownCount > 0) ?? evidence[0] ?? null;
}
