/**
 * TUI renderer for code_refactor_plan — renderCall + renderResult.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { type ResultOptios, renderSimpleResult, type ToolResult } from "../../ui/tui/common.ts";

/** ── renderCall ────────────────────────────────────────────────── */

export function renderRefactorPlanCall(args: unknown, theme: Theme, _context: unknown): Text {
  const params = (args ?? {}) as {
    operation?: Record<string, { newName?: string }>;
    target?: { anchor?: { file: string }; handle?: string };
  };

  let content = theme.fg("toolTitle", "code_refactor_plan");
  const operation = params.operation ? Object.entries(params.operation)[0] : undefined;
  if (operation) {
    content += ` ${theme.fg("accent", operation[0])}`;
    if (operation[1].newName) content += ` ${theme.fg("muted", operation[1].newName)}`;
  }
  if (params.target?.anchor) {
    const file = params.target.anchor.file.split("/").pop() ?? params.target.anchor.file;
    content += ` ${theme.fg("muted", file)}`;
  } else if (params.target?.handle) {
    content += ` ${theme.fg("muted", params.target.handle)}`;
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
