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

  if (params.query) {
    content += ` ${theme.fg("accent", params.query)}`;
  } else if (params.file) {
    const file = params.file.split("/").pop() ?? params.file;
    content += ` ${theme.fg("accent", file)}`;
    if (params.line) content += theme.fg("warning", `:${params.line}`);
  }

  if (params.kind) {
    content += theme.fg("dim", ` [${params.kind}]`);
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
