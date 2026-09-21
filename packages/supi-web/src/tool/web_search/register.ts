import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { promptGuidelines, promptSnippet, toolDescription } from "./guidance.ts";
import { renderWebSearchCall, renderWebSearchResult } from "./render.ts";
import { webSearchSpec } from "./spec.ts";

/** Register the web_search tool. */
export function registerWebSearchTool(pi: ExtensionAPI): void {
  pi.registerTool({
    ...webSearchSpec,
    description: toolDescription,
    promptSnippet,
    promptGuidelines: [...promptGuidelines],
    renderCall: renderWebSearchCall,
    renderResult: renderWebSearchResult,
  });
}
