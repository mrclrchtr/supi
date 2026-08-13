/** TUI renderer for code_refactor_apply. */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import {
  formatCallValue,
  type ResultOptios,
  renderDomainError,
  renderDomainResult,
  renderExecutionError,
  renderMarkdownDetail,
  renderPartial,
  renderToolDisplaySections,
  renderTruncationDisclosure,
  type ToolRendererContext,
  type ToolResult,
} from "../../ui/tui/common.ts";

/** Render the compact code_refactor_apply call header. */
export function renderRefactorApplyCall(
  args: unknown,
  theme: Theme,
  _context: ToolRendererContext | undefined,
): Text {
  const params = (args ?? {}) as { planId?: unknown };
  const planId = formatCallValue(params.planId);
  const suffix = planId ? ` ${theme.fg("accent", planId)}` : "";
  return new Text(`${theme.fg("toolTitle", "code_refactor_apply")}${suffix}`, 0, 0);
}

/** Render code_refactor_apply progress, status, and structured result details. */
export function renderRefactorApplyResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  context: ToolRendererContext | undefined,
): Container | Text {
  if (options.isPartial) return renderPartial("Applying…", theme);

  const executionError = renderExecutionError(context, "code_refactor_apply failed", theme);
  if (executionError) return executionError;
  const domainError = renderDomainError(result, theme);
  if (domainError) return renderDomainResult(result, options, theme, domainError);

  if (!options.expanded) {
    const applied =
      result.details?.status === "completed" ||
      (result.details?.status === undefined && result.details?.data?.confidence === "semantic");
    const status = new Text(
      applied
        ? theme.fg("success", theme.bold("Plan applied"))
        : theme.fg("error", "Refactor apply failed"),
      0,
      0,
    );
    const truncation = renderTruncationDisclosure(result, theme);
    if (!truncation) return status;
    const container = new Container();
    container.addChild(status);
    container.addChild(new Spacer(1));
    container.addChild(truncation);
    return container;
  }

  const container = new Container();
  renderToolDisplaySections(container, result.details?.displaySections, theme);
  const truncation = renderTruncationDisclosure(result, theme);
  if (truncation) {
    container.addChild(new Spacer(1));
    container.addChild(truncation);
  }
  renderMarkdownDetail(container, result, theme);
  return container;
}
