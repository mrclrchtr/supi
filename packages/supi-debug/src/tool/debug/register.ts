import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { renderDebugToolCall, renderDebugToolResult } from "../../renderer.ts";
import { makeDebugExecute } from "./execute.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "./guidance.ts";
import { debugSpec } from "./spec.ts";

/** Register the debug agent tool. */
export function registerDebugTool(pi: ExtensionAPI): void {
  pi.registerTool({
    ...debugSpec,
    description: toolDescription,
    promptSnippet,
    promptGuidelines,
    execute: makeDebugExecute(),
    renderCall: renderDebugToolCall,
    renderResult: renderDebugToolResult,
  });
}
