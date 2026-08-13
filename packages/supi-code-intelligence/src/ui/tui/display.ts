import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Container, Text } from "@earendil-works/pi-tui";
import { readToolDisplaySections, truncateDisplayText } from "../../tool/result/display.ts";
import type { ToolDisplaySection } from "../../tool/result/types.ts";

/** Render bounded structured rows for an expanded TUI body. */
export function renderToolDisplaySections(
  container: Container,
  value: unknown,
  theme: Theme,
): void {
  for (const section of readToolDisplaySections(value)) {
    container.addChild(
      new Text(theme.fg("dim", `${section.title}${formatDisplayBounds(section)}`), 0, 0),
    );
    for (const line of section.lines) {
      container.addChild(new Text(theme.fg("muted", line), 0, 0));
    }
  }
}

function formatDisplayBounds(section: ToolDisplaySection): string {
  if (section.totalCount === null) {
    const omitted = section.omittedCount ? `; ${section.omittedCount} collected omitted` : "";
    const reason = section.partialReason
      ? `; more may exist — ${section.partialReason}`
      : "; partial";
    return ` (${section.shownCount}${omitted}${reason})`;
  }
  if (section.omittedCount && section.omittedCount > 0) {
    return ` (${section.shownCount} of ${section.totalCount}; ${section.omittedCount} omitted)`;
  }
  return ` (${section.totalCount})`;
}

/** Format one call argument for a compact human transcript row. */
export function formatCallValue(value: unknown, maxLength = 60): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return truncateDisplayText(normalized, maxLength);
}

/** Show the final path segment while accepting both POSIX and Windows paths. */
export function formatCallPath(value: unknown, maxLength = 60): string | null {
  const formatted = formatCallValue(value, Number.MAX_SAFE_INTEGER);
  if (!formatted) return null;
  return formatCallValue(formatted.split(/[\\/]/).pop() ?? formatted, maxLength);
}
