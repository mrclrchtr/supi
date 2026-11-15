/** Transcript renderers for tui_render. Presentation only: they read assembled details. */

import type {
  KeybindingHints,
  Theme,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Container,
  stripTerminalSequences,
  Text,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import type { TuiRenderDetails } from "./result.ts";

interface TuiRenderCallArgs {
  target?: { tool?: { name?: unknown; index?: unknown }; toolCallId?: unknown };
  format?: unknown;
  expanded?: unknown;
}

interface TuiRenderTranscriptResult {
  content: Array<{ type: string; text?: string }>;
  details?: unknown;
}

type RenderContext = Pick<KeybindingHints, "keyText" | "keyHint"> & { isError: boolean };

/** Lines that truncate to the render width, so preview rows never wrap. */
class TruncatedLines implements Component {
  constructor(private readonly lines: string[]) {}
  render(width: number): string[] {
    return this.lines.map((line) => truncateToWidth(line, width));
  }
  invalidate(): void {}
}

function describeTarget(target: TuiRenderCallArgs["target"]): string {
  if (typeof target?.toolCallId === "string") return target.toolCallId;
  const name = typeof target?.tool?.name === "string" ? target.tool.name : "?";
  const index = target?.tool?.index;
  return typeof index === "number" && index > 0 ? `${name} #${index}` : name;
}

/** Render the call header: target and non-default view options. */
export function renderTuiRenderCall(args: unknown, theme: Theme): Text {
  const input = (args ?? {}) as TuiRenderCallArgs;
  const view = [
    typeof input.format === "string" ? input.format : undefined,
    input.expanded === true ? "expanded" : undefined,
  ].filter((part): part is string => part !== undefined);
  let content = `${theme.fg("toolTitle", theme.bold("tui_render"))} ${theme.fg("accent", describeTarget(input.target))}`;
  if (view.length > 0) content += ` ${theme.fg("dim", view.join(" · "))}`;
  return new Text(content, 0, 0);
}

function readDetails(details: unknown): TuiRenderDetails | undefined {
  const record = details as Partial<TuiRenderDetails> | undefined;
  return record && typeof record.toolName === "string" && record.preview
    ? (record as TuiRenderDetails)
    : undefined;
}

function summaryLine(details: TuiRenderDetails, theme: Theme): string {
  const position =
    details.index === 0
      ? `latest of ${details.matchCount}`
      : `#${details.index} back of ${details.matchCount}`;
  const view = `${details.toolName} · ${position} · ${details.expanded ? "expanded" : "collapsed"} · ${details.width} cols · ${details.format}`;
  const flags: string[] = [];
  for (const slot of ["call", "result"] as const) {
    if (details.renderer[slot] === "fallback") flags.push(theme.fg("warning", `${slot} fallback`));
  }
  const errorCount = details.rendererErrors.length;
  if (errorCount > 0) {
    flags.push(theme.fg("error", `${errorCount} renderer error${errorCount === 1 ? "" : "s"}`));
  }
  return [theme.fg("muted", view), ...flags].join(theme.fg("dim", " · "));
}

function previewLines(details: TuiRenderDetails, theme: Theme, context: RenderContext): string[] {
  // ANSI previews would restyle the transcript; show their visible text instead.
  const lines = details.preview.lines.map((line) =>
    details.format === "ansi" ? stripTerminalSequences(line) : line,
  );
  if (details.preview.omitted > 0) {
    const expand = context.keyText("app.tools.expand")
      ? `, ${context.keyHint("app.tools.expand", "to expand")}`
      : "";
    lines.push(theme.fg("dim", `… ${details.preview.omitted} more lines${expand}`));
  }
  return lines;
}

/** Render a compact summary with a row preview, or the full model text when expanded. */
export function renderTuiRenderResult(
  result: TuiRenderTranscriptResult,
  options: ToolRenderResultOptions,
  theme: Theme,
  context: RenderContext,
): Component {
  const text = result.content.find((part) => part.type === "text")?.text ?? "";
  if (context.isError) return new Text(theme.fg("error", text || "tui_render failed"), 0, 0);
  const details = readDetails(result.details);
  if (!details || options.expanded) {
    return new Text(details?.format === "ansi" ? stripTerminalSequences(text) : text, 0, 0);
  }
  // The summary wraps so flags stay visible; preview rows truncate like terminal lines.
  const container = new Container();
  container.addChild(new Text(summaryLine(details, theme), 0, 0));
  container.addChild(new TruncatedLines(previewLines(details, theme, context)));
  return container;
}
