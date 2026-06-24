/**
 * TUI renderer for code_context — renderCall + renderResult.
 */

import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { formatEvidenceBadge } from "@mrclrchtr/supi-code-runtime/api";
import type { CodeContextToolParams } from "../../tool/execute-context.ts";
import { type ResultOptios, renderPartial, type ToolResult } from "./common.ts";

/** ── renderCall ────────────────────────────────────────────────── */

export function renderContextCall(args: unknown, theme: Theme, _context: unknown): Text {
  const params = (args ?? {}) as CodeContextToolParams;

  let content = theme.fg("toolTitle", "code_context");

  if (params.targetId) {
    content += ` ${theme.fg("accent", "target")}`;
  } else if (params.file) {
    const file = params.file.split("/").pop() ?? params.file;
    content += ` ${theme.fg("accent", file)}`;
    if (params.line) {
      content += theme.fg("warning", `:${params.line}`);
    }
  } else if (params.task) {
    content += ` ${theme.fg("accent", params.task.slice(0, 40))}`;
  } else {
    content += ` ${theme.fg("muted", "orientation")}`;
  }

  if (params.include?.length) {
    content += theme.fg(
      "dim",
      ` (${params.include.slice(0, 3).join(", ")}${params.include.length > 3 ? "…" : ""})`,
    );
  }

  return new Text(content, 0, 0);
}

/** ── renderResult ──────────────────────────────────────────────── */

export function renderContextResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  _context: unknown,
): Container | Text {
  if (options.isPartial) {
    return renderPartial("Gathering context…", theme);
  }

  const container = new Container();
  const data =
    result.details?.type === "context" ? (result.details.data as Record<string, unknown>) : null;
  const markdownText = result.content.find((c) => c.type === "text")?.text ?? "";

  if (result.isError) {
    container.addChild(new Text(theme.fg("error", "code_context failed"), 0, 0));
    return container;
  }

  if (!options.expanded) {
    container.addChild(buildCompactSummary(data, theme));
    return container;
  }

  // Expanded view
  container.addChild(buildHeader(data, theme));

  const target = data?.target as Record<string, unknown> | undefined;
  if (target) {
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(
        theme.fg(
          "muted",
          `${String(target.name ?? "symbol")} — ${String(target.file ?? "")}:${String(target.displayLine ?? "")}`,
        ),
        0,
        0,
      ),
    );
  }

  const sections = (data?.renderedSections as string[] | undefined) ?? [];
  if (sections.length > 0) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("dim", `Sections: ${sections.join(", ")}`), 0, 0));
  }

  if (data?.omittedCount) {
    const badge = formatEvidenceBadge({
      shownCount: sections.length,
      totalCount: sections.length + Number(data.omittedCount),
      omittedCount: Number(data.omittedCount),
      partialReason: null,
      label: "sections",
    });
    container.addChild(new Text(theme.fg("dim", badge), 0, 0));
  }

  if (markdownText) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("dim", "▸ raw markdown"), 0, 0));
    container.addChild(new Markdown(markdownText, 0, 0, getMarkdownTheme()));
  }

  return container;
}

/** ── Helpers ───────────────────────────────────────────────────── */

function buildCompactSummary(data: Record<string, unknown> | null, theme: Theme): Text {
  if (!data) {
    return new Text(theme.fg("dim", "No context"), 0, 0);
  }

  const sections = (data?.renderedSections as string[] | undefined) ?? [];
  const confidence = (data.confidence as string) ?? "";
  const dot = theme.fg("dim", "·");
  const segments: string[] = [
    `${theme.fg("dim", "sections")} ${theme.fg("success", theme.bold(`${sections.length}`))}`,
  ];

  if (confidence) {
    segments.push(`${theme.fg("dim", "confidence")} ${theme.fg("muted", confidence)}`);
  }

  const target = data.target as Record<string, unknown> | undefined;
  if (target?.name) {
    segments.push(theme.fg("muted", String(target.name)));
  }

  return new Text(segments.join(` ${dot} `), 0, 0);
}

function buildHeader(data: Record<string, unknown> | null, theme: Theme): Text {
  if (!data) return new Text("", 0, 0);

  const sections = (data?.renderedSections as string[] | undefined) ?? [];
  const confidence = (data.confidence as string) ?? "";

  const dot = theme.fg("dim", "·");
  const parts = [
    `${theme.fg("dim", "sections")} ${theme.fg("accent", theme.bold(`${sections.length}`))}`,
  ];
  if (confidence) {
    parts.push(`${theme.fg("dim", "confidence")} ${theme.fg("muted", confidence)}`);
  }

  return new Text(parts.join(` ${dot} `), 0, 0);
}
