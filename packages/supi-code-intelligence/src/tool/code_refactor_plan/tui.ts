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
  const params = (args ?? {}) as { operation?: Record<string, unknown> };

  let content = theme.fg("toolTitle", "code_refactor_plan");
  const operation = params.operation ? Object.entries(params.operation)[0] : undefined;
  if (operation) {
    content += ` ${theme.fg("accent", formatCallValue(operation[0], 40) ?? "operation")}`;
    const payload = (operation[1] ?? {}) as {
      newName?: unknown;
      kind?: unknown;
      file?: unknown;
      target?: { anchor?: { file?: unknown }; handle?: unknown };
    };
    const detail = formatCallValue(payload.newName) ?? formatCallValue(payload.kind);
    if (detail) content += ` ${theme.fg("muted", detail)}`;
    const location =
      formatCallPath(payload.file) ??
      formatCallPath(payload.target?.anchor?.file) ??
      formatCallValue(payload.target?.handle);
    if (location) content += ` ${theme.fg("muted", location)}`;
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
  return renderSimpleResult(
    result,
    options,
    theme,
    { progress: "Planning…", failure: "code_refactor_plan failed" },
    context,
  );
}
