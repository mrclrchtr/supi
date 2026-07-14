/**
 * TUI renderer for code_resolve — renderCall + renderResult.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { type ResultOptios, renderSimpleResult, type ToolResult } from "../../ui/tui/common.ts";
import type { CodeResolveToolParams } from "./execute.ts";

/** ── renderCall ────────────────────────────────────────────────── */

export function renderResolveCall(args: unknown, theme: Theme, _context: unknown): Text {
  const params = (args ?? {}) as CodeResolveToolParams;

  let content = theme.fg("toolTitle", "code_resolve");

  if ("symbol" in params.target) {
    content += ` ${theme.fg("accent", params.target.symbol.query)}`;
    if (params.target.symbol.symbolKind) {
      content += theme.fg("dim", ` [${params.target.symbol.symbolKind}]`);
    }
  } else if ("anchor" in params.target) {
    const point = params.target.anchor;
    const file = point.file.split("/").pop() ?? point.file;
    content += ` ${theme.fg("accent", file)}${theme.fg("warning", `:${point.line}`)}`;
  } else if ("file" in params.target) {
    const file = params.target.file.split("/").pop() ?? params.target.file;
    content += ` ${theme.fg("accent", file)}`;
  }

  return new Text(content, 0, 0);
}

/** ── renderResult ──────────────────────────────────────────────── */

export function renderResolveResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  _context: unknown,
): ReturnType<typeof renderSimpleResult> {
  return renderSimpleResult(result, options, theme, "Resolving…");
}
