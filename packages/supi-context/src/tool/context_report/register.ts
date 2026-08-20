import type { BuildSystemPromptOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { makeContextReportExecute } from "./execute.ts";
import { promptSnippet, toolDescription } from "./guidance.ts";
import { renderContextToolCall, renderContextToolResult } from "./render.ts";
import { contextReportSpec } from "./spec.ts";

/** Register the context_report agent tool. */
export function registerContextReportTool(
  pi: ExtensionAPI,
  getOptions: () => BuildSystemPromptOptions | undefined,
): void {
  pi.registerTool({
    ...contextReportSpec,
    description: toolDescription,
    promptSnippet,
    execute: makeContextReportExecute(pi, getOptions),
    renderCall: renderContextToolCall,
    renderResult: renderContextToolResult,
  });
}
