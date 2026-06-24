/**
 * TUI renderer for code_refactor_apply — renderCall + renderResult.
 *
 * Has a custom result renderer (not using renderSimpleResult) because
 * its compact view shows success/error status rather than a count badge.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import {
  type ResultOptios,
  renderMarkdownDetail,
  renderPartial,
  type ToolResult,
} from "./common.ts";

/** ── renderCall ────────────────────────────────────────────────── */

export function renderRefactorApplyCall(_args: unknown, theme: Theme, _context: unknown): Text {
  return new Text(
    `${theme.fg("toolTitle", "code_refactor_apply")} ${theme.fg("accent", "apply plan")}`,
    0,
    0,
  );
}

/** ── renderResult ──────────────────────────────────────────────── */

export function renderRefactorApplyResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  _context: unknown,
): Container | Text {
  if (options.isPartial) {
    return renderPartial("Applying…", theme);
  }

  if (!options.expanded) {
    return new Text(
      result.isError
        ? theme.fg("error", "Refactor apply failed")
        : theme.fg("success", theme.bold("Plan applied")),
      0,
      0,
    );
  }

  const container = new Container();
  renderMarkdownDetail(container, result, theme);
  return container;
}
