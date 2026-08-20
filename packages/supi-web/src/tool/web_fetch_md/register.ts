import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getWebFetchPromptSurface } from "./guidance.ts";
import { renderWebFetchCall, renderWebFetchResult } from "./render.ts";
import { webFetchMdSpec } from "./spec.ts";

/** Register the web_fetch_md tool. */
export function registerWebFetchMdTool(pi: ExtensionAPI): void {
  const surface = getWebFetchPromptSurface();
  pi.registerTool({
    ...webFetchMdSpec,
    description: surface.description,
    promptSnippet: surface.promptSnippet,
    promptGuidelines: surface.promptGuidelines,
    renderCall: renderWebFetchCall,
    renderResult: renderWebFetchResult,
  });
}
