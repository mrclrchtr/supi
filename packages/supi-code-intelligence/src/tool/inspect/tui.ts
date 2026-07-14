/**
 * TUI renderer for code_inspect — renderCall + renderResult.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { type ResultOptios, renderSimpleResult, type ToolResult } from "../../ui/tui/common.ts";

/** ── renderCall ────────────────────────────────────────────────── */

export function renderInspectCall(args: unknown, theme: Theme, _context: unknown): Text {
  const params = (args ?? {}) as {
    point?: { file: string; line: number; character: number };
  };

  let content = theme.fg("toolTitle", "code_inspect");

  if (params.point) {
    const file = params.point.file.split("/").pop() ?? params.point.file;
    content += ` ${theme.fg("accent", file)}`;
    content += theme.fg("warning", `:${params.point.line}`);
    content += theme.fg("dim", `:${params.point.character}`);
  }

  return new Text(content, 0, 0);
}

/** ── renderResult ──────────────────────────────────────────────── */

export function renderInspectResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  _context: unknown,
): ReturnType<typeof renderSimpleResult> {
  return renderSimpleResult(result, options, theme, "Inspecting…");
}
