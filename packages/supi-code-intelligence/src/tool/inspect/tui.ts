/**
 * TUI renderer for code_inspect — renderCall + renderResult.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { type ResultOptios, renderSimpleResult, type ToolResult } from "../../ui/tui/common.ts";

/** ── renderCall ────────────────────────────────────────────────── */

export function renderInspectCall(args: unknown, theme: Theme, _context: unknown): Text {
  const params = (args ?? {}) as { file?: string; line?: number; character?: number };

  let content = theme.fg("toolTitle", "code_inspect");

  if (params.file) {
    const file = params.file.split("/").pop() ?? params.file;
    content += ` ${theme.fg("accent", file)}`;
    if (params.line) {
      content += theme.fg("warning", `:${params.line}`);
      if (params.character) content += theme.fg("dim", `:${params.character}`);
    }
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
