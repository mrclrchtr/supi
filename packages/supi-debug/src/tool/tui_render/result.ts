import {
  type AgentToolResult,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import type { CaptureResult } from "./capture.ts";
import type { TuiRenderFormat } from "./input.ts";
import type { TuiRenderOutput } from "./result-schema.ts";
import type { SelectedToolResult } from "./select.ts";

/** The view a row was rendered in. */
export interface TuiRenderView {
  format: TuiRenderFormat;
  width: number;
  expanded: boolean;
}

/** Session-persisted details: the structured facts without the rendered lines. */
export type TuiRenderDetails = Omit<TuiRenderOutput, "lines">;

/** Final tool result: bounded model text, native structured data, and persisted details. */
export type TuiRenderToolResult = AgentToolResult<TuiRenderDetails> & {
  structuredContent: TuiRenderOutput;
};

function describeSelection(selection: SelectedToolResult, view: TuiRenderView): string {
  const position =
    selection.index === 0
      ? `latest of ${selection.matchCount}`
      : `#${selection.index} back of ${selection.matchCount}`;
  return [
    `${selection.toolName} · call ${selection.toolCallId} · ${position}`,
    view.expanded ? "expanded" : "collapsed",
    `width ${view.width}`,
    view.format,
  ].join(" · ");
}

function describeRenderers(capture: CaptureResult, isError: boolean): string {
  const { shell, renderer } = capture;
  const frame = shell.background ? `${shell.kind} (${shell.background})` : shell.kind;
  const status = isError ? " · result isError" : "";
  return `renderer: call ${renderer.call}, result ${renderer.result} · shell ${frame}${status}`;
}

/** Assemble model text, native structured data, and details from one captured row. */
export function buildTuiRenderResult(
  selection: SelectedToolResult,
  view: TuiRenderView,
  capture: CaptureResult,
): TuiRenderToolResult {
  const header = [
    describeSelection(selection, view),
    describeRenderers(capture, selection.isError),
  ];
  for (const error of capture.rendererErrors) {
    header.push(
      `Renderer error (${error.slot}): ${error.message}. Pi drew this slot with its fallback.`,
    );
  }
  for (const note of capture.notes) header.push(`Note: ${note}`);

  const truncation = truncateHead(capture.lines.join("\n"), {
    maxLines: DEFAULT_MAX_LINES - header.length - 4,
    maxBytes: DEFAULT_MAX_BYTES - 1024,
  });
  let text = `${header.join("\n")}\n\n${truncation.content}`;
  if (truncation.truncated) {
    text += `\n\n[Rendered output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Use a collapsed view or read structuredContent.lines from codemode.]`;
  }

  const details: TuiRenderDetails = {
    toolName: selection.toolName,
    toolCallId: selection.toolCallId,
    index: selection.index,
    matchCount: selection.matchCount,
    isError: selection.isError,
    ...view,
    renderer: capture.renderer,
    shell: capture.shell,
    rendererErrors: capture.rendererErrors,
    notes: capture.notes,
  };
  return {
    content: [{ type: "text", text }],
    details,
    structuredContent: { ...details, lines: capture.lines },
  };
}
