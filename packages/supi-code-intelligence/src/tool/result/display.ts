import type { ToolDisplaySection } from "./types.ts";

/** Maximum number of rows shown for one expanded TUI section. */
export const MAX_TUI_DISPLAY_ITEMS = 20;

/** Maximum visible characters kept in one structured TUI row. */
export const MAX_TUI_DISPLAY_LINE_LENGTH = 240;

/** Inputs for one bounded structured TUI section. */
export interface ToolDisplaySectionInput<T> {
  key: string;
  title: string;
  items: readonly T[];
  format: (item: T) => string;
  totalCount?: number | null;
  omittedCount?: number | null;
  partialReason?: string | null;
  maxItems?: number;
}

/** Build a bounded, serializable TUI section from collected facts. */
export function createToolDisplaySection<T>(input: ToolDisplaySectionInput<T>): ToolDisplaySection {
  const maxItems = Math.max(0, input.maxItems ?? MAX_TUI_DISPLAY_ITEMS);
  const items = input.items.slice(0, maxItems);
  const lines = items.map((item) => truncateDisplayText(input.format(item)));
  const displayOmittedCount = Math.max(0, input.items.length - items.length);
  let totalCount: number | null;
  if (input.totalCount === undefined) totalCount = input.items.length;
  else totalCount = input.totalCount;
  const omittedCount =
    totalCount === null
      ? input.omittedCount === null || input.omittedCount === undefined
        ? displayOmittedCount || null
        : input.omittedCount + displayOmittedCount
      : Math.max(0, totalCount - lines.length);

  return {
    key: input.key,
    title: input.title,
    lines,
    shownCount: lines.length,
    totalCount,
    omittedCount,
    partialReason: input.partialReason ?? null,
  };
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
    if (
      typeof record.key !== "string" ||
      typeof record.title !== "string" ||
      !Array.isArray(record.lines) ||
      !record.lines.every((line) => typeof line === "string") ||
      !isCount(record.shownCount) ||
      !isNullableCount(record.totalCount) ||
      !isNullableCount(record.omittedCount) ||
      !isNullableString(record.partialReason)
    ) {
      return [];
    }
    return [
      {
        key: record.key,
        title: record.title,
        lines: record.lines
          .slice(0, MAX_TUI_DISPLAY_ITEMS)
          .map((line) => truncateDisplayText(line)),
        shownCount: record.shownCount,
        totalCount: record.totalCount,
        omittedCount: record.omittedCount,
        partialReason: record.partialReason,
      },
    ];
  });
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNullableCount(value: unknown): value is number | null {
  return value === null || isCount(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
