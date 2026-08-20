import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { promptGuidelines, promptSnippet, toolDescription } from "./guidance.ts";
import { renderFetchCall, renderFetchResult } from "./render.ts";
import { webDocsFetchSpec } from "./spec.ts";

/** Register the web_docs_fetch tool. */
export function registerWebDocsFetchTool(pi: ExtensionAPI): void {
  pi.registerTool({
    ...webDocsFetchSpec,
    description: toolDescription,
    promptSnippet,
    promptGuidelines: [...promptGuidelines],
    renderCall: renderFetchCall,
    renderResult: renderFetchResult,
  });
}
