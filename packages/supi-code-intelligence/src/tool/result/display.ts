import {
  describeEvidenceList,
  type EvidenceListMetadata,
  readEvidenceListFacts,
  toEvidenceListFacts,
} from "../../analysis/evidence.ts";
import type { ToolDisplaySection } from "./types.ts";

/** Maximum number of rows shown for one expanded TUI section. */
export const MAX_TUI_DISPLAY_ITEMS = 20;

/** Maximum visible characters kept in one structured TUI row. */
export const MAX_TUI_DISPLAY_LINE_LENGTH = 240;

/** Inputs for one bounded structured TUI section. */
export interface ToolDisplaySectionInput<T> {
  /** Section key; defaults to the evidence key. */
  key?: string;
  title: string;
  /** Rows to show; the view may hide some as Display omissions. */
  items: readonly T[];
  /** Canonical Evidence list metadata this section previews; only constructors produce it. */
  evidence: EvidenceListMetadata;
  format: (item: T) => string;
  maxItems?: number;
  /** Explicit content-count meaning when display rows are not individual Evidence atoms. */
  preview?: ToolDisplaySection["preview"];
}

/**
 * Build a bounded, serializable TUI section. Evidence facts are copied
 * unchanged; rows the view cap hides are reported as a separate Display
 * omission and never merged into evidence counts.
 */
export function createToolDisplaySection<T>(input: ToolDisplaySectionInput<T>): ToolDisplaySection {
  const maxItems = Math.max(0, input.maxItems ?? MAX_TUI_DISPLAY_ITEMS);
  const items = input.items.slice(0, maxItems);
  return {
    key: input.key ?? input.evidence.key,
    title: input.title,
    lines: items.map((item) => truncateDisplayText(input.format(item))),
    evidence: toEvidenceListFacts(input.evidence),
    displayOmittedCount: input.items.length - items.length,
    ...(input.preview ? { preview: { ...input.preview } } : {}),
  };
}

/** Canonical Display omission phrase, e.g. `5 rows hidden in view`; null when none. */
export function describeDisplayOmission(count: number, unit = "row"): string | null {
  return count > 0 ? `${count} ${unit}${count === 1 ? "" : "s"} hidden in view` : null;
}

/** Canonical bounds suffix for one TUI section title, e.g. ` (3 of 5; 2 omitted)`. */
export function formatDisplaySectionBounds(section: ToolDisplaySection): string {
  const unit = section.preview?.unit;
  const parts = [
    section.preview?.evidenceSummary ?? (unit ? null : describeEvidenceList(section.evidence)),
    unit ? `${section.lines.length} preview ${unit}${section.lines.length === 1 ? "" : "s"}` : null,
    describeDisplayOmission(section.displayOmittedCount, unit ? `preview ${unit}` : "row"),
  ].filter((part): part is string => Boolean(part));
  return parts.length ? ` (${parts.join("; ")})` : "";
}

/** Keep structured TUI rows readable without parsing or emitting Markdown. */
export function truncateDisplayText(
  value: string,
  maxLength = MAX_TUI_DISPLAY_LINE_LENGTH,
): string {
  const limit = Math.max(1, maxLength);
  return value
    .split("\n")
    .map((line) => {
      if (line.length <= limit) return line;
      return `${line.slice(0, Math.max(0, limit - 1))}…`;
    })
    .join("\n");
}

/** Read valid structured TUI sections from persisted tool details. */
export function readToolDisplaySections(value: unknown): ToolDisplaySection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const evidence = readEvidenceListFacts(record.evidence);
    if (
      typeof record.key !== "string" ||
      typeof record.title !== "string" ||
      !Array.isArray(record.lines) ||
      !record.lines.every((line) => typeof line === "string") ||
      !evidence ||
      !isCount(record.displayOmittedCount)
    ) {
      return [];
    }
    const preview = readPreview(record.preview);
    return [
      {
        key: record.key,
        title: record.title,
        lines: record.lines
          .slice(0, MAX_TUI_DISPLAY_ITEMS)
          .map((line) => truncateDisplayText(line)),
        evidence,
        displayOmittedCount: record.displayOmittedCount,
        ...(preview ? { preview } : {}),
      },
    ];
  });
}

function readPreview(value: unknown): ToolDisplaySection["preview"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.unit !== "group" && record.unit !== "block") return undefined;
  return {
    unit: record.unit,
    ...(typeof record.evidenceSummary === "string"
      ? { evidenceSummary: truncateDisplayText(record.evidenceSummary) }
      : {}),
  };
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
