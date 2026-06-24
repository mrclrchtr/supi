/**
 * TUI renderers for the simpler code-intelligence tools:
 * code_resolve, code_inspect, code_find, code_impact,
 * code_refactor_plan, code_refactor_apply.
 *
 * All use default box shell (no renderShell: "self").
 */

import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { formatEvidenceBadge } from "@mrclrchtr/supi-code-runtime/api";
import type { CodeFindToolParams } from "../../tool/execute-find.ts";
import type { CodeImpactToolParams } from "../../tool/execute-impact.ts";
import type { CodeResolveToolParams } from "../../tool/execute-resolve.ts";

interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  details?: { type: string; data: Record<string, unknown> };
  isError?: boolean;
}

/** ── code_resolve ──────────────────────────────────────────────────── */

export function renderResolveCall(args: unknown, theme: Theme, _context: unknown): Text {
  const params = (args ?? {}) as CodeResolveToolParams;
  let content = theme.fg("toolTitle", "code_resolve");

  if (params.query) {
    content += ` ${theme.fg("accent", params.query)}`;
  } else if (params.file) {
    const file = params.file.split("/").pop() ?? params.file;
    content += ` ${theme.fg("accent", file)}`;
    if (params.line) content += theme.fg("muted", `:${params.line}`);
  }

  if (params.kind) {
    content += theme.fg("dim", ` [${params.kind}]`);
  }

  return new Text(content, 0, 0);
}

export function renderResolveResult(
  result: ToolResult,
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  _context: unknown,
): Container | Text {
  return renderSimpleResult(result, options, theme, "Resolving…");
}

/** ── code_inspect ──────────────────────────────────────────────────── */

export function renderInspectCall(args: unknown, theme: Theme, _context: unknown): Text {
  const params = (args ?? {}) as { file?: string; line?: number; character?: number };
  let content = theme.fg("toolTitle", "code_inspect");

  if (params.file) {
    const file = params.file.split("/").pop() ?? params.file;
    content += ` ${theme.fg("accent", file)}`;
    if (params.line) {
      content += theme.fg("muted", `:${params.line}`);
      if (params.character) content += theme.fg("dim", `:${params.character}`);
    }
  }

  return new Text(content, 0, 0);
}

export function renderInspectResult(
  result: ToolResult,
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  _context: unknown,
): Container | Text {
  return renderSimpleResult(result, options, theme, "Inspecting…");
}

/** ── code_find ─────────────────────────────────────────────────────── */

export function renderFindCall(args: unknown, theme: Theme, _context: unknown): Text {
  const params = (args ?? {}) as CodeFindToolParams;
  const mode = params.mode ?? "text";

  let content = theme.fg("toolTitle", "code_find");

  if (params.query) {
    content += ` ${theme.fg("accent", JSON.stringify(params.query))}`;
  }

  content += ` ${theme.fg("muted", mode)}`;

  if (params.kind) {
    content += theme.fg("dim", ` [${params.kind}]`);
  }

  return new Text(content, 0, 0);
}

export function renderFindResult(
  result: ToolResult,
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  _context: unknown,
): Container | Text {
  return renderSimpleResult(result, options, theme, "Searching…");
}

/** ── code_impact ───────────────────────────────────────────────────── */

export function renderImpactCall(args: unknown, theme: Theme, _context: unknown): Text {
  const params = (args ?? {}) as CodeImpactToolParams;
  let content = theme.fg("toolTitle", "code_impact");

  if (params.symbol) {
    content += ` ${theme.fg("accent", params.symbol)}`;
  } else if (params.file) {
    const file = params.file.split("/").pop() ?? params.file;
    content += ` ${theme.fg("accent", file)}`;
  }

  if (params.change) {
    content += theme.fg("dim", ` — "${params.change.slice(0, 40)}"`);
  }

  return new Text(content, 0, 0);
}

export function renderImpactResult(
  result: ToolResult,
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  _context: unknown,
): Container | Text {
  return renderSimpleResult(result, options, theme, "Analyzing impact…");
}

/** ── code_refactor_plan ────────────────────────────────────────────── */

export function renderRefactorPlanCall(args: unknown, theme: Theme, _context: unknown): Text {
  const params = (args ?? {}) as {
    operation?: string;
    newName?: string;
    file?: string;
  };
  let content = theme.fg("toolTitle", "code_refactor_plan");

  if (params.operation) {
    content += ` ${theme.fg("accent", params.operation)}`;
  }

  if (params.newName) {
    content += ` ${theme.fg("muted", params.newName)}`;
  } else if (params.file) {
    const file = params.file.split("/").pop() ?? params.file;
    content += ` ${theme.fg("muted", file)}`;
  }

  return new Text(content, 0, 0);
}

export function renderRefactorPlanResult(
  result: ToolResult,
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  _context: unknown,
): Container | Text {
  return renderSimpleResult(result, options, theme, "Planning…");
}

/** ── code_refactor_apply ───────────────────────────────────────────── */

export function renderRefactorApplyCall(_args: unknown, theme: Theme, _context: unknown): Text {
  return new Text(
    `${theme.fg("toolTitle", "code_refactor_apply")} ${theme.fg("accent", "apply plan")}`,
    0,
    0,
  );
}

export function renderRefactorApplyResult(
  result: ToolResult,
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  _context: unknown,
): Container | Text {
  if (options.isPartial) {
    return new Text(theme.fg("warning", "Applying…"), 0, 0);
  }

  const markdownText = result.content.find((c) => c.type === "text")?.text ?? "";

  if (!options.expanded) {
    return new Text(
      result.isError
        ? theme.fg("error", "Refactor apply failed")
        : theme.fg("success", "Plan applied"),
      0,
      0,
    );
  }

  const container = new Container();
  if (markdownText) {
    container.addChild(new Markdown(markdownText, 0, 0, getMarkdownTheme()));
  }
  return container;
}

/** ── Shared simple result renderer ─────────────────────────────────── */

function renderSimpleResult(
  result: ToolResult,
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  label: string,
): Container | Text {
  if (options.isPartial) {
    return new Text(theme.fg("warning", label), 0, 0);
  }

  if (result.isError) {
    return new Text(theme.fg("error", "Tool failed"), 0, 0);
  }

  const data = result.details?.data as Record<string, unknown> | undefined;
  if (options.expanded) {
    return buildExpandedView(result, data, theme);
  }

  return buildSimpleCompact(data, theme);
}

function buildExpandedView(
  result: ToolResult,
  data: Record<string, unknown> | undefined,
  theme: Theme,
): Container {
  const container = new Container();

  const header = buildSimpleHeader(data, theme);
  if (header) {
    container.addChild(header);
    container.addChild(new Spacer(1));
  }

  appendEvidenceLines(container, data, theme);
  appendMarkdownDetail(container, result, theme);

  return container;
}

function appendEvidenceLines(
  container: Container,
  data: Record<string, unknown> | undefined,
  theme: Theme,
): void {
  const lists = data?.evidenceLists as Array<Record<string, unknown>> | undefined;
  if (!lists || lists.length === 0) return;

  for (const ev of lists) {
    const badge = formatEvidenceBadge({
      shownCount: Number(ev.shownCount ?? 0),
      totalCount: ev.totalCount != null ? Number(ev.totalCount) : null,
      omittedCount: ev.omittedCount != null ? Number(ev.omittedCount) : null,
      partialReason: typeof ev.partialReason === "string" ? ev.partialReason : null,
      label: String(ev.key ?? "results"),
    });
    container.addChild(new Text(theme.fg("muted", badge), 0, 0));
  }
  container.addChild(new Spacer(1));
}

function appendMarkdownDetail(container: Container, result: ToolResult, theme: Theme): void {
  const markdownText = result.content.find((c) => c.type === "text")?.text ?? "";
  if (!markdownText) return;

  container.addChild(new Text(theme.fg("dim", "▸ raw markdown"), 0, 0));
  container.addChild(new Markdown(markdownText, 0, 0, getMarkdownTheme()));
}

function buildSimpleCompact(data: Record<string, unknown> | undefined, theme: Theme): Text {
  if (!data) return new Text(theme.fg("dim", "No results"), 0, 0);

  const candidateCount = (data.candidateCount as number) ?? (data.targetCount as number) ?? 0;
  const confidence = (data.confidence as string) ?? "";

  const badge = formatEvidenceBadge({
    shownCount: candidateCount,
    totalCount: candidateCount,
    omittedCount: 0,
    partialReason: null,
    label: "results",
  });

  return new Text(
    `${theme.fg("success", badge)}${confidence ? theme.fg("dim", ` — ${confidence}`) : ""}`,
    0,
    0,
  );
}

function buildSimpleHeader(data: Record<string, unknown> | undefined, theme: Theme): Text | null {
  if (!data) return null;

  const candidateCount = (data.candidateCount as number) ?? (data.targetCount as number) ?? 0;
  const confidence = (data.confidence as string) ?? "";

  if (candidateCount === 0 && !confidence) return null;

  const badge = formatEvidenceBadge({
    shownCount: candidateCount,
    totalCount: candidateCount,
    omittedCount: 0,
    partialReason: null,
    label: "results",
  });

  return new Text(
    `${theme.fg("accent", badge)}${confidence ? theme.fg("dim", ` — ${confidence}`) : ""}`,
    0,
    0,
  );
}
