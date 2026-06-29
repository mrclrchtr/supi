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

/** Resolve a human-readable label for an evidence list key. */
export function evidenceLabel(key: string): string {
  return EVIDENCE_KEY_LABELS[key] ?? key;
}

// ── Evidence entires ─────────────────────────────────────────────

export interface EvidenceEntry {
  key?: string;
  shownCount?: number;
  totalCount?: number | null;
  omittedCount?: number | null;
  partialReason?: string | null;
}

// ── Evidence section ─────────────────────────────────────────────

/** Append formatted evidence badge lines to a container. */
export function renderEvidenceLines(
  container: Container,
  entries: EvidenceEntry[] | undefined,
  theme: Theme,
): void {
  if (!entries || entries.length === 0) return;
  for (const ev of entries) {
    const badge = formatEvidenceBadge({
      shownCount: Number(ev.shownCount ?? 0),
      totalCount: ev.totalCount != null ? Number(ev.totalCount) : null,
      omittedCount: ev.omittedCount != null ? Number(ev.omittedCount) : null,
      partialReason: typeof ev.partialReason === "string" ? ev.partialReason : null,
      label: evidenceLabel(String(ev.key ?? "")),
    });
    container.addChild(new Text(theme.fg("muted", badge), 0, 0));
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

// ── Result optios ────────────────────────────────────────────────

export interface ResultOptios {
  expanded: boolean;
  isPartial: boolean;
}

// ── Shared simple-result renderer ────────────────────────────────

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

  const lists = data?.evidenceLists as EvidenceEntry[] | undefined;
  if (lists && lists.length > 0) {
    container.addChild(new Spacer(1));
    renderEvidenceLines(container, lists, theme);
    container.addChild(new Spacer(1));
  }

  renderMarkdownDetail(container, result, theme);

  return container;
}

/** Options for {@link buildSimpleCompact} and {@link buildSimpleHeader}. */
export interface SimpleResultOptions {
  /** Omitted count for the evidence badge. Defaults to 0. */
  omittedCount?: number;
}

export function buildSimpleCompact(
  data: Record<string, unknown> | undefined,
  theme: Theme,
  opts?: SimpleResultOptions,
): Text {
  if (!data) return new Text(theme.fg("dim", "No results"), 0, 0);

  const candidateCount = (data.candidateCount as number) ?? (data.targetCount as number) ?? 0;
  const omittedCount = opts?.omittedCount ?? 0;
  const confidence = (data.confidence as string) ?? "";

  const badge = formatEvidenceBadge({
    shownCount: candidateCount,
    totalCount: candidateCount + omittedCount,
    omittedCount,
    partialReason: null,
    label: "results",
  });

  const dot = theme.fg("dim", "·");
  const segments = [theme.fg("success", theme.bold(badge))];
  if (confidence) {
    segments.push(`${theme.fg("dim", "confidence")} ${theme.fg("muted", confidence)}`);
  }

  return new Text(segments.join(` ${dot} `), 0, 0);
}

export function buildSimpleHeader(
  data: Record<string, unknown> | undefined,
  theme: Theme,
  opts?: SimpleResultOptions,
): Text | null {
  if (!data) return null;

  const candidateCount = (data.candidateCount as number) ?? (data.targetCount as number) ?? 0;
  const omittedCount = opts?.omittedCount ?? 0;
  const confidence = (data.confidence as string) ?? "";

  if (candidateCount === 0 && !confidence) return null;

  const badge = formatEvidenceBadge({
    shownCount: candidateCount,
    totalCount: candidateCount + omittedCount,
    omittedCount,
    partialReason: null,
    label: "results",
  });

  const dot = theme.fg("dim", "·");
  const segments = [theme.fg("accent", theme.bold(badge))];
  if (confidence) {
    segments.push(`${theme.fg("dim", "confidence")} ${theme.fg("muted", confidence)}`);
  }

  return new Text(segments.join(` ${dot} `), 0, 0);
}
