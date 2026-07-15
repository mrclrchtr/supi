import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import {
  type EvidenceEntry,
  formatEvidenceEntry,
  type ResultOptios,
  readEvidenceEntries,
  renderPartial,
  type ToolResult,
} from "../../ui/tui/common.ts";
import type { CodeOrientationToolParams } from "./execute.ts";

/** ── renderCall ────────────────────────────────────────────────── */

export function renderOrientationCall(args: unknown, theme: Theme, _context: unknown): Text {
  const params = (args ?? {}) as CodeOrientationToolParams;

  let content = theme.fg("toolTitle", "code_orientation");

  if (!params.focus) {
    content += ` ${theme.fg("muted", "workspace")}`;
  } else if ("path" in params.focus) {
    const focus = params.focus.path.split("/").pop() ?? params.focus.path;
    content += ` ${theme.fg("accent", focus)}`;
  } else if ("module" in params.focus) {
    content += ` ${theme.fg("accent", params.focus.module)}`;
  } else {
    content += ` ${theme.fg("accent", "target")}`;
  }

  return new Text(content, 0, 0);
}

/** ── renderResult ──────────────────────────────────────────────── */

export function renderOrientationResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  _context: unknown,
): Container | Text {
  if (options.isPartial) {
    return renderPartial("Orienting…", theme);
  }

  const container = new Container();
  const data =
    result.details?.type === "context" ? (result.details.data as Record<string, unknown>) : null;
  const markdownText = result.content.find((c) => c.type === "text")?.text ?? "";

  if (result.isError) {
    container.addChild(new Text(theme.fg("error", "code_orientation failed"), 0, 0));
    return container;
  }

  if (!options.expanded) {
    container.addChild(buildCompactSummary(data, theme));
    return container;
  }

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

  if (markdownText) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("dim", "▸ raw markdown"), 0, 0));
    container.addChild(new Markdown(markdownText, 0, 0, getMarkdownTheme()));
  }

  return container;
}

/** ── Helpers ───────────────────────────────────────────────────── */

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
  if (evidence) {
    segments.push(theme.fg(badgeColor, theme.bold(formatEvidenceEntry(evidence))));
  }

  const confidence = typeof data.confidence === "string" ? data.confidence : "";
  if (confidence) {
    segments.push(`${theme.fg("dim", "confidence")} ${theme.fg("muted", confidence)}`);
  }

  const target = data.target as Record<string, unknown> | undefined;
  if (target?.name) segments.push(theme.fg("muted", String(target.name)));

  return segments;
}

function orientationEvidence(data: Record<string, unknown>): EvidenceEntry | null {
  return (
    readEvidenceEntries(data.evidenceLists).find(
      (evidence) => evidence.key === "orientation.sections",
    ) ?? null
  );
}
