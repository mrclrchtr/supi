import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { WEB_TOOL_NAMESPACE } from "../namespace.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "./guidance.ts";
import { renderSearchCall, renderSearchResult } from "./render.ts";
import { webDocsSearchSpec } from "./spec.ts";

/** Register the web_docs_search tool. */
export function registerWebDocsSearchTool(pi: ExtensionAPI): void {
  pi.registerTool({
    ...webDocsSearchSpec,
    namespace: WEB_TOOL_NAMESPACE,
    description: toolDescription,
    promptSnippet,
    promptGuidelines: [...promptGuidelines],
    renderCall: renderSearchCall,
    renderResult: renderSearchResult,
  });
}
