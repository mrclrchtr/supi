/**
 * TUI renderer for code_find — renderCall + renderResult.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { CodeFindToolParams } from "../../tool/execute-find.ts";
import { type ResultOptios, renderSimpleResult, type ToolResult } from "./common.ts";

/** ── renderCall ────────────────────────────────────────────────── */

export function renderFindCall(args: unknown, theme: Theme, _context: unknown): Text {
  const params = (args ?? {}) as CodeFindToolParams;
  const mode = params.mode ?? "text";

  let content = theme.fg("toolTitle", "code_find");

  if (params.query) {
    content += ` ${theme.fg("accent", JSON.stringify(params.query))}`;
  }

  content += ` ${theme.fg("muted", mode)}`;

  if (params.kind) {
    content += theme.fg("dim", ` [${params.kind}]`);
  }

  return new Text(content, 0, 0);
}

/** ── renderResult ──────────────────────────────────────────────── */

export function renderFindResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  _context: unknown,
): ReturnType<typeof renderSimpleResult> {
  return renderSimpleResult(result, options, theme, "Searching…");
}
