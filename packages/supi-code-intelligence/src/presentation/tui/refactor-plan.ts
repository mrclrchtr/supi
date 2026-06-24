/**
 * TUI renderer for code_refactor_plan — renderCall + renderResult.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { type ResultOptios, renderSimpleResult, type ToolResult } from "./common.ts";

/** ── renderCall ────────────────────────────────────────────────── */

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

/** ── renderResult ──────────────────────────────────────────────── */

export function renderRefactorPlanResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  _context: unknown,
): ReturnType<typeof renderSimpleResult> {
  return renderSimpleResult(result, options, theme, "Planning…");
}
