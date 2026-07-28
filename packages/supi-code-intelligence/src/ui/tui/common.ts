/**
 * Shared TUI rendering utilities for code-intelligence tool results.
 *
 * Extracted from the per-tool renderers to eliminate duplication:
 * evidence section rendering, markdown detail, count badges,
 * partial/error guards, and the shared simple-result pattern.
 */

import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { formatEvidenceBadge } from "@mrclrchtr/supi-code-runtime/api";

// ── Result type ──────────────────────────────────────────────────

/** Shape of a pi tool result consumed by renderResult functions. */
export interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  details?: { type: string; data: Record<string, unknown> };
  isError?: boolean;
}

// ── Evidence key labels ──────────────────────────────────────────

export const EVIDENCE_KEY_LABELS: Record<string, string> = {
  "callees.calls": "calls",
  "exports.symbols": "exports",
  "find.astMatches": "AST matches",
  "find.semanticSymbols": "symbols",
  "health.dirtyFiles": "dirty files",
  "implements.locations": "implementations",
  "imports.modules": "imports",
  "references.locations": "references",
  "refactor.edits": "edits",
  "orientation.sections": "sections",
  "resolve.candidates": "candidates",
  "resolve.targets": "targets",
};

/** Resolve a human-readable label for an evidence list key. */
export function evidenceLabel(key: string): string {
  return EVIDENCE_KEY_LABELS[key] ?? key;
}

// ── Serialized evidence ──────────────────────────────────────────

/** Evidence metadata projected by result assembly into tool details. */
export interface EvidenceEntry {
  key: string;
  shownCount: number;
  totalCount: number | null;
  omittedCount: number | null;
  partialReason: string | null;
  invalidLocationCount?: number;
}

/**
 * Read only complete serialized evidence metadata from tool details.
 *
 * Renderers intentionally discard malformed or absent entries rather than
 * reconstructing totals from candidate counts or omission hints.
 */
export function readEvidenceEntries(value: unknown): EvidenceEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = readEvidenceEntry(entry);
    return parsed ? [parsed] : [];
  });
}

function readEvidenceEntry(value: unknown): EvidenceEntry | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { key, shownCount, totalCount, omittedCount, partialReason, invalidLocationCount } = record;
  if (
    typeof key !== "string" ||
    typeof shownCount !== "number" ||
    !isNullableNumber(totalCount) ||
    !isNullableNumber(omittedCount) ||
    !isNullableString(partialReason) ||
    !isOptionalCount(invalidLocationCount)
  ) {
    return null;
  }
  return {
    key,
    shownCount,
    totalCount,
    omittedCount,
    partialReason,
    ...(invalidLocationCount === undefined ? {} : { invalidLocationCount }),
  };
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isOptionalCount(value: unknown): value is number | undefined {
  return (
    value === undefined || (typeof value === "number" && Number.isInteger(value) && value >= 0)
  );
}

/** Format one assembled evidence list without recomputing its bounds. */
export function formatEvidenceEntry(entry: EvidenceEntry): string {
  const badge = formatEvidenceBadge({
    shownCount: entry.shownCount,
    totalCount: entry.totalCount,
    omittedCount: entry.omittedCount,
    partialReason: entry.partialReason,
    label: evidenceLabel(entry.key),
  });
  if (!entry.invalidLocationCount) return badge;
  const noun = entry.invalidLocationCount === 1 ? "location" : "locations";
  const reason = entry.partialReason ? ` — ${entry.partialReason}` : "";
  return `${badge}; ${entry.invalidLocationCount} invalid provider ${noun} omitted${reason}`;
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
  const markdownText = source.content?.find((c) => c.type === "text")?.text ?? "";
  if (!markdownText) return;
  container.addChild(new Spacer(1));
  const divider = `${theme.fg("border", "────")} ${theme.fg("dim", "raw markdown")} ${theme.fg("border", "─".repeat(100))}`;
  container.addChild(new Text(divider, 0, 0));
  container.addChild(new Markdown(markdownText, 0, 0, getMarkdownTheme()));
}

// ── Partial / error guards ───────────────────────────────────────

export function renderPartial(label: string, theme: Theme): Text {
  return new Text(theme.fg("warning", label), 0, 0);
}

export function renderError(label: string, theme: Theme): Text {
  return new Text(theme.fg("error", label), 0, 0);
}

// ── Result options ───────────────────────────────────────────────

export interface ResultOptios {
  expanded: boolean;
  isPartial: boolean;
}

// ── Shared simple-result renderer ─────────────────────────────────

/**
 * Shared result renderer for the "simple" code-intelligence tools
 * (resolve, inspect, find, impact, refactor_plan, refactor_apply).
 *
 * Handles partial, error, compact, and expanded states uniformly.
 */
export function renderSimpleResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  partialLabel: string,
): Container | Text {
  if (options.isPartial) return renderPartial(partialLabel, theme);
  if (result.isError) return renderError("Tool failed", theme);

  const data = result.details?.data as Record<string, unknown> | undefined;
  if (options.expanded) return buildExpandedView(result, data, theme);

  return buildSimpleCompact(data, theme);
}

function buildExpandedView(
  result: ToolResult,
  data: Record<string, unknown> | undefined,
  theme: Theme,
): Container {
  const container = new Container();

  const header = buildSimpleHeader(data, theme);
  if (header) container.addChild(header);

  renderStructuredDetailBody(container, data, theme);
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
  const unknownNestingCount = data.groupUnknownNestingCount;
  if (
    typeof unknownNestingCount === "number" &&
    Number.isInteger(unknownNestingCount) &&
    unknownNestingCount > 0
  ) {
    segments.push(theme.fg("warning", `${unknownNestingCount} hierarchy unknown`));
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

  const unavailable = data.unavailableSections;
  if (Array.isArray(unavailable) && unavailable.length > 0) {
    lines.push(`unavailable: ${unavailable.join(", ")}`);
  }

  const unknownNestingCount = data.groupUnknownNestingCount;
  if (
    typeof unknownNestingCount === "number" &&
    Number.isInteger(unknownNestingCount) &&
    unknownNestingCount > 0
  ) {
    lines.push(`hierarchy unknown: ${unknownNestingCount}`);
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
