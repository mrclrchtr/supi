import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEBUG_TOOL_NAMESPACE } from "../namespace.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "./guidance.ts";
import { renderDebugToolCall, renderDebugToolResult } from "./render.ts";
import { debugSpec } from "./spec.ts";

/** Register the debug agent tool. */
export function registerDebugTool(pi: ExtensionAPI): void {
  pi.registerTool({
    ...debugSpec,
    namespace: DEBUG_TOOL_NAMESPACE,
    description: toolDescription,
    promptSnippet,
    promptGuidelines,
    renderCall: renderDebugToolCall,
    renderResult: renderDebugToolResult,
  });
}
