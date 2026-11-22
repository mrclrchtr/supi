/**
 * Shared transcript helpers for structured Code Intelligence results.
 * Tool renderers own presentation; these helpers read assembled details.
 */

import {
  getMarkdownTheme,
  type Theme,
  type ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { type Component, Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import {
  describeEvidenceList,
  type EvidenceListFacts,
  readEvidenceListFacts,
} from "../../analysis/evidence.ts";
import { truncateDisplayText } from "../../tool/result/display.ts";
import { renderToolDisplaySections } from "./display.ts";
import { renderExecutionError } from "./execution-error.ts";

export { formatCallPath, formatCallValue, renderToolDisplaySections } from "./display.ts";
export { renderExecutionError } from "./execution-error.ts";

import type {
  ToolDisplaySection,
  ToolOutputTruncationDetails,
  ToolResultStatus,
} from "../../tool/result/types.ts";

// ── Result type ──────────────────────────────────────────────────

/** Shape of a pi tool result consumed by renderResult functions. */
export interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  details?: {
    type: string;
    data: Record<string, unknown>;
    status?: ToolResultStatus;
    message?: string;
    displaySections?: readonly ToolDisplaySection[];
    truncation?: ToolOutputTruncationDetails;
  };
}

/** Pi render context used by Code Intelligence result renderers. */
export interface ToolRendererContext {
  isError: boolean;
}

/** Pi render options used by Code Intelligence result renderers. */
export type ResultOptios = ToolRenderResultOptions;

// ── Evidence key labels ──────────────────────────────────────────

export const EVIDENCE_KEY_LABELS: Record<string, string> = {
  "callees.calls": "calls",
  "exports.symbols": "exports",
  "find.astMatches": "AST matches",
  "find.semanticSymbols": "symbols",
  "implements.locations": "implementations",
  "imports.modules": "imports",
  "inspect.definitions": "definitions",
  "inspect.diagnostics": "nearby diagnostics",
  "graph.candidates": "candidates",
  "orientation.candidates": "candidates",
  "references.locations": "references",
  "refactor.edits": "edits",
  "resolve.candidates": "candidates",
  "resolve.targets": "targets",
};

/** Resolve a human-readable label for an evidence list key. */
export function evidenceLabel(key: string): string {
  return EVIDENCE_KEY_LABELS[key] ?? key;
}

// ── Serialized evidence ──────────────────────────────────────────

/** Evidence list facts projected by result assembly into tool details. */
export type EvidenceEntry = EvidenceListFacts;

/**
 * Read only complete, consistent serialized evidence facts from tool details.
 * Renderers discard malformed entries rather than reconstructing totals.
 */
export function readEvidenceEntries(value: unknown): EvidenceEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = readEvidenceListFacts(entry);
    return parsed ? [parsed] : [];
  });
}

/** Format one assembled evidence list with the canonical phrase and its label. */
export function formatEvidenceEntry(entry: EvidenceEntry): string {
  const label = evidenceLabel(entry.key);
  const singular = label === "candidates" ? "candidate" : label;
  return describeEvidenceList(entry, { one: singular, other: label });
}

/** Append formatted evidence badge lines to a container. */
export function renderEvidenceLines(container: Container, entries: unknown, theme: Theme): void {
  for (const entry of readEvidenceEntries(entries)) {
    container.addChild(new Text(theme.fg("muted", formatEvidenceEntry(entry)), 0, 0));
  }
}

// ── Markdown detail ──────────────────────────────────────────────

interface MarkdownSource {
  content?: Array<{ type: string; text?: string }>;
}

/** Append a "raw markdown" section to a container when markdown content is present. */
export function renderMarkdownDetail(
  container: Container,
  source: MarkdownSource,
  theme: Theme,
): void {
  // Persisted content can hold malformed blocks; skip anything that is not a text block.
  const block = source.content?.find((c) => c?.type === "text" && typeof c.text === "string");
  const markdownText = block?.text ?? "";
  if (!markdownText) return;
  container.addChild(new Spacer(1));
  const divider = `${theme.fg("border", "────")} ${theme.fg("dim", "raw markdown")} ${theme.fg("border", "────")}`;
  container.addChild(new Text(divider, 0, 0));
  container.addChild(new Markdown(markdownText, 0, 0, getMarkdownTheme()));
}

// ── Partial / error guards ───────────────────────────────────────

export function renderPartial(label: string, theme: Theme): Text {
  return new Text(theme.fg("warning", label), 0, 0);
}

/** Render a domain error encoded in structured result details. */
export function renderDomainError(result: ToolResult, theme: Theme): Text | null {
  const status = result.details?.status;
  if (status !== "invalid-input" && status !== "disambiguation" && status !== "unavailable") {
    return null;
  }

  const label =
    status === "invalid-input"
      ? "Invalid input"
      : status === "disambiguation"
        ? "Choose a target"
        : "Unavailable";
  const message = result.details?.message
    ? `: ${truncateDisplayText(result.details.message, 160)}`
    : "";
  return new Text(theme.fg("error", `${label}${message}`), 0, 0);
}

/** Render an invalid-input or unavailable result with its structured body. */
export function renderDomainResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  error: Text,
): Container | Text {
  if (!options.expanded) return error;
  const container = new Container();
  container.addChild(error);
  renderToolDisplaySections(container, result.details?.displaySections, theme);
  renderMarkdownDetail(container, result, theme);
  return container;
}

/** Render the structured output-truncation disclosure. */
export function renderTruncationDisclosure(result: ToolResult, theme: Theme): Text | null {
  const truncation = result.details?.truncation;
  if (!truncation?.truncated && !truncation?.displayTruncated) return null;

  const label = truncation.truncated ? "Output truncated" : "Display limited";
  const path = truncation.fullOutputPath
    ? `; ${truncation.truncated ? "full output" : "full returned evidence"}: ${truncateDisplayText(truncation.fullOutputPath, 160)}`
    : truncation.displayTruncated
      ? "; full returned evidence file unavailable"
      : "";
  return new Text(theme.fg("warning", `${label}${path}`), 0, 0);
}

// ── Shared simple-result renderer ─────────────────────────────────

/**
 * Shared result renderer for the "simple" code-intelligence tools
 * (resolve, inspect, find, impact, refactor_plan, refactor_apply).
 *
 * Handles partial, error, compact, and expanded states uniformly.
 */
// biome-ignore lint/complexity/useMaxParams: renderer signature keeps the shared helper convenient for each tool
export function renderSimpleResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  labels: { progress: string; failure: string },
  context?: ToolRendererContext,
): Component {
  if (options.isPartial) return renderPartial(labels.progress, theme);

  const executionError = renderExecutionError(
    result,
    { isError: context?.isError, expanded: options.expanded, label: labels.failure },
    theme,
  );
  if (executionError) return executionError;

  const domainError = renderDomainError(result, theme);
  if (domainError) return renderDomainResult(result, options, theme, domainError);

  const data = result.details?.data as Record<string, unknown> | undefined;
  if (options.expanded) return buildExpandedView(result, data, theme);

  const compact = buildSimpleCompact(data, theme);
  const truncation = renderTruncationDisclosure(result, theme);
  if (!truncation) return compact;

  const container = new Container();
  container.addChild(compact);
  container.addChild(new Spacer(1));
  container.addChild(truncation);
  return container;
}

function buildExpandedView(
  result: ToolResult,
  data: Record<string, unknown> | undefined,
  theme: Theme,
): Container {
  const container = new Container();

  const header = buildSimpleHeader(data, theme);
  if (header) container.addChild(header);

  renderToolDisplaySections(container, result.details?.displaySections, theme);
  renderStructuredDetailBody(container, data, theme);
  const truncation = renderTruncationDisclosure(result, theme);
  if (truncation) {
    container.addChild(new Spacer(1));
    container.addChild(truncation);
  }
  renderMarkdownDetail(container, result, theme);

  return container;
}

function evidenceBadges(data: Record<string, unknown> | undefined): string[] {
  return readEvidenceEntries(data?.evidenceLists).map(formatEvidenceEntry);
}

export function buildSimpleCompact(data: Record<string, unknown> | undefined, theme: Theme): Text {
  if (!data) return new Text(theme.fg("dim", "No results"), 0, 0);

  const badges = evidenceBadges(data);
  const confidence = typeof data.confidence === "string" ? data.confidence : "";
  const dot = theme.fg("dim", "·");
  const segments = badges.map((badge) => theme.fg("success", theme.bold(badge)));
  const unknownLevelCount = data.outlineUnknownLevelCount;
  if (
    typeof unknownLevelCount === "number" &&
    Number.isInteger(unknownLevelCount) &&
    unknownLevelCount > 0
  ) {
    segments.push(theme.fg("warning", `${unknownLevelCount} position unknown`));
  }
  if (confidence) {
    segments.push(`${theme.fg("dim", "confidence")} ${theme.fg("muted", confidence)}`);
  }

  if (segments.length === 0) return new Text(theme.fg("dim", "No assembled evidence"), 0, 0);
  return new Text(segments.join(` ${dot} `), 0, 0);
}

export function renderStructuredDetailBody(
  container: Container,
  data: Record<string, unknown> | undefined,
  theme: Theme,
): void {
  if (!data) return;
  const lines = structuredDetailLines(data);
  if (lines.length === 0) return;
  container.addChild(new Spacer(1));
  for (const line of lines) {
    container.addChild(new Text(theme.fg("muted", line), 0, 0));
  }
}

function structuredDetailLines(data: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const focusTarget = data.focusTarget;
  if (typeof focusTarget === "string" && focusTarget.length > 0) {
    lines.push(`target: ${focusTarget}`);
  }

  lines.push(...inspectSectionStatusLines(data.sections));

  const unknownLevelCount = data.outlineUnknownLevelCount;
  if (
    typeof unknownLevelCount === "number" &&
    Number.isInteger(unknownLevelCount) &&
    unknownLevelCount > 0
  ) {
    lines.push(`position unknown: ${unknownLevelCount}`);
  }

  const checkNext = data.checkNext;
  if (Array.isArray(checkNext) && checkNext.length > 0) {
    lines.push(`check next: ${checkNext.slice(0, 3).join(" · ")}`);
  }

  const likelyTests = data.likelyTests;
  if (Array.isArray(likelyTests) && likelyTests.length > 0) {
    lines.push(`likely tests: ${likelyTests.slice(0, 3).join(" · ")}`);
  }

  const nextQueries = data.nextQueries;
  if (Array.isArray(nextQueries) && nextQueries.length > 0) {
    lines.push(`next: ${nextQueries.slice(0, 2).join(" · ")}`);
  }

  return lines;
}

function inspectSectionStatusLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((section) => {
    if (typeof section !== "object" || section === null || Array.isArray(section)) return [];
    const record = section as Record<string, unknown>;
    if (record.status !== "partial" && record.status !== "unavailable") return [];
    const title = typeof record.title === "string" ? record.title : "section";
    const reason = typeof record.reason === "string" ? ` — ${record.reason}` : "";
    return [`${title.toLowerCase()}: ${record.status}${reason}`];
  });
}

export function buildSimpleHeader(
  data: Record<string, unknown> | undefined,
  theme: Theme,
): Text | null {
  if (!data) return null;

  const badges = evidenceBadges(data);
  const confidence = typeof data.confidence === "string" ? data.confidence : "";
  const dot = theme.fg("dim", "·");
  const segments = badges.map((badge) => theme.fg("accent", theme.bold(badge)));
  if (confidence) {
    segments.push(`${theme.fg("dim", "confidence")} ${theme.fg("muted", confidence)}`);
  }

  if (segments.length === 0) return null;
  return new Text(segments.join(` ${dot} `), 0, 0);
}
