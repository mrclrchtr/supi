import type {
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Static } from "typebox";
import { captureToolRow } from "./capture.ts";
import { TUI_RENDER_DEFAULT_WIDTH, TUI_RENDER_MAX_WIDTH, TUI_RENDER_MIN_WIDTH } from "./input.ts";
import type { ToolRendererObserver } from "./observer.ts";
import { buildTuiRenderResult, type TuiRenderToolResult, type TuiRenderView } from "./result.ts";
import { selectToolResult, type ToolResultSelector } from "./select.ts";
import type { tuiRenderSpec } from "./spec.ts";

type TuiRenderParams = Static<(typeof tuiRenderSpec)["parameters"]>;

/** Typed execute signature for tui_render. */
// biome-ignore lint/complexity/useMaxParams: pi tool execute signature
export type TuiRenderExecute = (
  toolCallId: string,
  params: TuiRenderParams,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<unknown> | undefined,
  ctx: ExtensionContext,
) => Promise<TuiRenderToolResult>;

function readSelector(target: TuiRenderParams["target"]): ToolResultSelector {
  const { tool, toolCallId } = target;
  if (tool && toolCallId === undefined) return { tool };
  if (toolCallId !== undefined && !tool) return { toolCallId };
  throw new Error("target must set exactly one of tool or toolCallId.");
}

function defaultWidth(): number {
  const columns = process.stdout.columns;
  if (!columns) return TUI_RENDER_DEFAULT_WIDTH;
  return Math.min(TUI_RENDER_MAX_WIDTH, Math.max(TUI_RENDER_MIN_WIDTH, columns));
}

/**
 * Build the tui_render executor.
 *
 * Throws (a failed tool result) when the selection has no match, when the TUI never drew
 * the selected tool in this session, or when the session has no TUI theme.
 */
export function makeTuiRenderExecute(
  pi: Pick<ExtensionAPI, "getSettings">,
  observer: ToolRendererObserver,
): TuiRenderExecute {
  // biome-ignore lint/complexity/useMaxParams: pi tool execute signature
  return async (_toolCallId, params, _signal, _onUpdate, ctx) => {
    if (ctx.mode !== "tui") {
      throw new Error(
        `tui_render needs the interactive TUI; this session runs in ${ctx.mode} mode.`,
      );
    }
    const selection = selectToolResult(ctx.sessionManager.getBranch(), readSelector(params.target));
    if (selection.kind === "not-found") throw new Error(selection.message);

    const observed = observer.lookup(selection.toolName);
    if (!observed) {
      throw new Error(
        `The TUI has not drawn "${selection.toolName}" since SuPi Debug loaded, so its renderers are unknown. Run /reload and retry. If it still fails, an extension loaded before SuPi Debug resolves this tool's renderers without passing them on.`,
      );
    }

    const view: TuiRenderView = {
      format: params.format ?? "plain",
      width: params.width ?? defaultWidth(),
      expanded: params.expanded ?? false,
    };
    const capture = captureToolRow({
      selection,
      renderers: observed.renderers,
      theme: ctx.ui.theme,
      ...view,
      cwd: ctx.cwd,
      outputPad: pi.getSettings().outputPad ?? 1,
    });
    return buildTuiRenderResult(selection, view, capture);
  };
}
