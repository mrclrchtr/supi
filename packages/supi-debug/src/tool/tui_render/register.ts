import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadDebugConfig } from "../../config.ts";
import { DEBUG_TOOL_NAMESPACE } from "../namespace.ts";
import { makeTuiRenderExecute } from "./execute.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "./guidance.ts";
import { createToolRendererObserver } from "./observer.ts";
import { renderTuiRenderCall, renderTuiRenderResult } from "./render.ts";
import { TUI_RENDER_TOOL_NAME, tuiRenderSpec } from "./spec.ts";

/**
 * Register the tui_render tool (inactive) and the renderer observer it reads.
 *
 * The observer is always registered so renderers are known once the tool is enabled.
 */
export function registerTuiRenderTool(pi: ExtensionAPI): void {
  const observer = createToolRendererObserver();
  pi.registerToolRenderer(observer.resolver);
  pi.registerTool({
    ...tuiRenderSpec,
    namespace: DEBUG_TOOL_NAMESPACE,
    description: toolDescription,
    promptSnippet,
    promptGuidelines,
    execute: makeTuiRenderExecute(pi, observer),
    renderCall: renderTuiRenderCall,
    renderResult: renderTuiRenderResult,
  });
}

/** Activate tui_render only while the Debug setting `tuiRenderTool` is on. */
export function syncTuiRenderTool(pi: ExtensionAPI, cwd: string): void {
  const active = pi.getActiveTools();
  const enabled = loadDebugConfig(cwd).tuiRenderTool;
  const next = enabled
    ? [...new Set([...active, TUI_RENDER_TOOL_NAME])]
    : active.filter((name) => name !== TUI_RENDER_TOOL_NAME);
  if (next.length !== active.length) pi.setActiveTools(next);
}
