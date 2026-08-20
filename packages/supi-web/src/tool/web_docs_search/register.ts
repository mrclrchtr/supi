import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { promptGuidelines, promptSnippet, toolDescription } from "./guidance.ts";
import { renderSearchCall, renderSearchResult } from "./render.ts";
import { webDocsSearchSpec } from "./spec.ts";

/** Register the web_docs_search tool. */
export function registerWebDocsSearchTool(pi: ExtensionAPI): void {
  pi.registerTool({
    ...webDocsSearchSpec,
    description: toolDescription,
    promptSnippet,
    promptGuidelines: [...promptGuidelines],
    renderCall: renderSearchCall,
    renderResult: renderSearchResult,
  });
}
