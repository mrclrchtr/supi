/** TUI renderer for code_find. */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
  formatCallValue,
  type ResultOptios,
  renderSimpleResult,
  type ToolRendererContext,
  type ToolResult,
} from "../../ui/tui/common.ts";
import type { CodeFindToolParams } from "./execute.ts";

/** Render the compact code_find call header. */
export function renderFindCall(
  args: unknown,
  theme: Theme,
  _context: ToolRendererContext | undefined,
): Text {
  const params = (args ?? {}) as Partial<CodeFindToolParams>;
  const mode = formatCallValue(params.mode, 20) ?? "mode?";

  let content = theme.fg("toolTitle", "code_find");
  const query = formatCallValue(params.query);
  if (query) content += ` ${theme.fg("accent", JSON.stringify(query))}`;
  content += ` ${theme.fg("muted", mode)}`;

  const kind = formatCallValue(params.kind, 30);
  if (kind) content += theme.fg("dim", ` [${kind}]`);

  return new Text(content, 0, 0);
}

/** Render code_find progress, status, and structured result details. */
export function renderFindResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  context: ToolRendererContext | undefined,
): ReturnType<typeof renderSimpleResult> {
  return renderSimpleResult(result, options, theme, "Searching…", context);
}
