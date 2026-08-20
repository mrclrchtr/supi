/** TUI renderer for code_inspect. */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
  formatCallPath,
  type ResultOptios,
  renderSimpleResult,
  type ToolRendererContext,
  type ToolResult,
} from "../../ui/tui/common.ts";

/** Render the compact code_inspect call header. */
export function renderInspectCall(
  args: unknown,
  theme: Theme,
  _context: ToolRendererContext | undefined,
): Text {
  const params = (args ?? {}) as {
    point?: { file?: unknown; line?: unknown; character?: unknown };
  };

  let content = theme.fg("toolTitle", "code_inspect");
  const point = params.point;
  if (point && typeof point === "object") {
    const file = formatCallPath(point.file);
    if (file) content += ` ${theme.fg("accent", file)}`;
    if (typeof point.line === "number") content += theme.fg("warning", `:${point.line}`);
    if (typeof point.character === "number") {
      content += theme.fg("dim", `:${point.character}`);
    }
  }

  return new Text(content, 0, 0);
}

/** Render code_inspect progress, status, and structured result details. */
export function renderInspectResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  context: ToolRendererContext | undefined,
): ReturnType<typeof renderSimpleResult> {
  return renderSimpleResult(result, options, theme, "Inspecting…", context);
}
