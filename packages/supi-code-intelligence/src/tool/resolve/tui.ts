/** TUI renderer for code_resolve. */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
  formatCallPath,
  formatCallValue,
  type ResultOptios,
  renderSimpleResult,
  type ToolRendererContext,
  type ToolResult,
} from "../../ui/tui/common.ts";
import type { CodeResolveToolParams } from "./execute.ts";

/** Render the compact code_resolve call header. */
export function renderResolveCall(
  args: unknown,
  theme: Theme,
  _context: ToolRendererContext | undefined,
): Text {
  const params = (args ?? {}) as Partial<CodeResolveToolParams>;
  let content = theme.fg("toolTitle", "code_resolve");
  const target = params.target;
  if (!target || typeof target !== "object") return new Text(content, 0, 0);

  const targetRecord = target as unknown as Record<string, unknown>;
  if (targetRecord.symbol && typeof targetRecord.symbol === "object") {
    content += renderResolveSymbol(targetRecord.symbol, theme);
  } else if (targetRecord.anchor && typeof targetRecord.anchor === "object") {
    content += renderResolveAnchor(targetRecord.anchor, theme);
  } else {
    const file = formatCallPath(targetRecord.file);
    if (file) content += ` ${theme.fg("accent", file)}`;
  }

  return new Text(content, 0, 0);
}

function renderResolveSymbol(value: object, theme: Theme): string {
  const symbol = value as { query?: unknown; symbolKind?: unknown };
  const query = formatCallValue(symbol.query);
  const kind = formatCallValue(symbol.symbolKind, 30);
  return `${query ? ` ${theme.fg("accent", query)}` : ""}${kind ? theme.fg("dim", ` [${kind}]`) : ""}`;
}

function renderResolveAnchor(value: object, theme: Theme): string {
  const point = value as { file?: unknown; line?: unknown };
  const file = formatCallPath(point.file);
  const line = typeof point.line === "number" ? `:${point.line}` : "";
  return file ? ` ${theme.fg("accent", file)}${theme.fg("warning", line)}` : "";
}

/** Render code_resolve progress, status, and structured result details. */
export function renderResolveResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  context: ToolRendererContext | undefined,
): ReturnType<typeof renderSimpleResult> {
  return renderSimpleResult(result, options, theme, "Resolving…", context);
}
