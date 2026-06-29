/**
 * TUI renderer for code_impact — renderCall + renderResult.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { type ResultOptios, renderSimpleResult, type ToolResult } from "../../ui/tui/common.ts";
import type { CodeImpactToolParams } from "./execute.ts";

/** ── renderCall ────────────────────────────────────────────────── */

export function renderImpactCall(args: unknown, theme: Theme, _context: unknown): Text {
  const params = (args ?? {}) as CodeImpactToolParams;

  let content = theme.fg("toolTitle", "code_impact");

  if (params.symbol) {
    content += ` ${theme.fg("accent", params.symbol)}`;
  } else if (params.file) {
    const file = params.file.split("/").pop() ?? params.file;
    content += ` ${theme.fg("accent", file)}`;
  }

  if (params.change) {
    content += theme.fg("dim", ` — "${params.change.slice(0, 40)}"`);
  }

  return new Text(content, 0, 0);
}

/** ── renderResult ──────────────────────────────────────────────── */

export function renderImpactResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  _context: unknown,
): ReturnType<typeof renderSimpleResult> {
  return renderSimpleResult(result, options, theme, "Analyzing impact…");
}
