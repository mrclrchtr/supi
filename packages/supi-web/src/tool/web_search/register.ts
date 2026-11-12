import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { WEB_TOOL_NAMESPACE } from "../namespace.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "./guidance.ts";
import { renderWebSearchCall, renderWebSearchResult } from "./render.ts";
import { webSearchSpec } from "./spec.ts";

/** Register the web_search tool. */
export function registerWebSearchTool(pi: ExtensionAPI): void {
  pi.registerTool({
    ...webSearchSpec,
    namespace: WEB_TOOL_NAMESPACE,
    description: toolDescription,
    promptSnippet,
    promptGuidelines: [...promptGuidelines],
    renderCall: renderWebSearchCall,
    renderResult: renderWebSearchResult,
  });
}
