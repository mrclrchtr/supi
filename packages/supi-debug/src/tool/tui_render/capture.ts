import {
  type Theme,
  ToolExecutionComponent,
  type ToolRenderers,
} from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, type TUI } from "@earendil-works/pi-tui";
import type {
  RendererSlot,
  RendererSource,
  ShellBackground,
  ShellKind,
  TuiRenderFormat,
} from "./input.ts";
import { createMarkingTheme, decodeMarkers } from "./marked-theme.ts";
import type { SelectedToolResult } from "./select.ts";

/** Frame facts of a captured row. */
export interface ShellFacts {
  kind: ShellKind;
  /** Theme background token of the frame; absent when the tool draws its own frame. */
  background?: ShellBackground;
}

/** One stored call and result plus the view to render it in. */
export interface CaptureInput {
  selection: SelectedToolResult;
  /** Resolved renderers; `undefined` when Pi draws the tool with its generic fallback. */
  renderers: ToolRenderers | undefined;
  /** Live theme, wrapped for `marked` output. */
  theme: Theme;
  format: TuiRenderFormat;
  width: number;
  expanded: boolean;
  cwd: string;
  /** Pi's `outputPad` setting, which the default frame applies. */
  outputPad: number;
}

/** Rendered lines and how Pi produced them. */
export interface CaptureResult {
  lines: string[];
  renderer: Record<RendererSlot, RendererSource>;
  shell: ShellFacts;
  /** Renderer exceptions; Pi then draws that slot with its generic fallback. */
  rendererErrors: Array<{ slot: RendererSlot; message: string }>;
  notes: string[];
}

// The component calls `requestRender()` on state changes; a captured row never repaints.
const NO_REPAINT_UI = { requestRender: () => undefined } as unknown as TUI;

type RendererErrors = CaptureResult["rendererErrors"];

function recordFailure<T>(errors: RendererErrors, slot: RendererSlot, render: () => T): T {
  try {
    return render();
  } catch (error) {
    errors.push({ slot, message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/** Record renderer exceptions and, when `theme` is set, pass it instead of Pi's theme. */
function instrument(
  renderers: ToolRenderers,
  theme: Theme | undefined,
  errors: RendererErrors,
): ToolRenderers {
  const { renderCall, renderResult } = renderers;
  return {
    renderShell: renderers.renderShell,
    renderCall:
      renderCall &&
      ((args, piTheme, context) =>
        recordFailure(errors, "call", () => renderCall(args, theme ?? piTheme, context))),
    renderResult:
      renderResult &&
      ((result, options, piTheme, context) =>
        recordFailure(errors, "result", () =>
          renderResult(result, options, theme ?? piTheme, context),
        )),
  };
}

function describeShell(renderers: ToolRenderers | undefined, isError: boolean): ShellFacts {
  const background = isError ? "toolErrorBg" : "toolSuccessBg";
  if (!renderers) return { kind: "fallback", background };
  if (renderers.renderShell === "self") return { kind: "self" };
  return { kind: "default", background };
}

function markedNotes(renderer: CaptureResult["renderer"], shell: ShellFacts): string[] {
  const notes = [
    "Markers cover styling through the renderer's theme argument. Text Pi styles with its global theme (for example Markdown) has no markers.",
  ];
  if (shell.background) notes.push(`The frame background (${shell.background}) is not marked.`);
  if (renderer.call === "fallback" || renderer.result === "fallback") {
    notes.push("Pi's generic fallback rendering uses its global theme, so it has no markers.");
  }
  return notes;
}

/**
 * Render one stored tool call and result as the transcript row the TUI shows.
 *
 * Uses Pi's own `ToolExecutionComponent`, so framing, call/result fallbacks, error state,
 * and expansion behave like the live transcript. Images are not drawn. `plain` and `marked`
 * strip terminal sequences and trailing padding; `ansi` returns the lines unchanged.
 */
export function captureToolRow(input: CaptureInput): CaptureResult {
  const { renderers, format, selection } = input;
  const rendererErrors: RendererErrors = [];
  const definition =
    renderers &&
    instrument(
      renderers,
      format === "marked" ? createMarkingTheme(input.theme) : undefined,
      rendererErrors,
    );
  const component = new ToolExecutionComponent(
    selection.toolName,
    selection.toolCallId,
    selection.args,
    { showImages: false, outputPad: input.outputPad },
    definition,
    NO_REPAINT_UI,
    input.cwd,
  );
  component.setArgsComplete();
  component.markExecutionStarted();
  component.updateResult({
    content: selection.result.content,
    details: selection.result.details,
    isError: selection.isError,
    ...(selection.durationMs === undefined ? {} : { durationMs: selection.durationMs }),
  });
  component.setExpanded(input.expanded);

  // The component re-renders on each state change; report each failing slot once.
  const raw = component.render(input.width);
  const uniqueErrors = [...new Map(rendererErrors.map((error) => [error.slot, error])).values()];
  const lines =
    format === "ansi"
      ? raw
      : raw.map((line) =>
          stripTerminalSequences(format === "marked" ? decodeMarkers(line) : line).trimEnd(),
        );
  const renderer = {
    call: renderers?.renderCall ? "custom" : "fallback",
    result: renderers?.renderResult ? "custom" : "fallback",
  } as const;
  const shell = describeShell(renderers, selection.isError);
  return {
    lines,
    renderer,
    shell,
    rendererErrors: uniqueErrors,
    notes: format === "marked" ? markedNotes(renderer, shell) : [],
  };
}
