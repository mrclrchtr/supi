/** TUI renderer for code_refactor_plan. */
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

/** Render the compact code_refactor_plan call header. */
export function renderRefactorPlanCall(
  args: unknown,
  theme: Theme,
  _context: ToolRendererContext | undefined,
): Text {
  const params = (args ?? {}) as {
    operation?: Record<string, { newName?: unknown } | undefined>;
    target?: { anchor?: { file?: unknown }; handle?: unknown };
  };

  let content = theme.fg("toolTitle", "code_refactor_plan");
  const operation = params.operation ? Object.entries(params.operation)[0] : undefined;
  if (operation) {
    content += ` ${theme.fg("accent", formatCallValue(operation[0], 40) ?? "operation")}`;
    const newName =
      operation[1] && typeof operation[1] === "object"
        ? formatCallValue(operation[1].newName)
        : null;
    if (newName) content += ` ${theme.fg("muted", newName)}`;
  }

  const anchorFile = formatCallPath(params.target?.anchor?.file);
  if (anchorFile) {
    content += ` ${theme.fg("muted", anchorFile)}`;
  } else {
    const handle = formatCallValue(params.target?.handle);
    if (handle) content += ` ${theme.fg("muted", handle)}`;
  }

  return new Text(content, 0, 0);
}

/** Render code_refactor_plan progress, status, and structured result details. */
export function renderRefactorPlanResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  context: ToolRendererContext | undefined,
): ReturnType<typeof renderSimpleResult> {
  return renderSimpleResult(result, options, theme, "Planning…", context);
}
