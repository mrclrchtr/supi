import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createWebFetchExecute } from "./execute.ts";
import { getWebFetchPromptSurface } from "./guidance.ts";
import { renderWebFetchCall, renderWebFetchResult } from "./render.ts";
import { webFetchMdSpec } from "./spec.ts";

/**
 * Register the web_fetch_md tool. `configCwd` fixes where Web settings are read, so a child
 * session keeps its containing session's Firecrawl policy.
 */
export function registerWebFetchMdTool(pi: ExtensionAPI, configCwd?: string): void {
  const surface = getWebFetchPromptSurface();
  pi.registerTool({
    ...webFetchMdSpec,
    ...(configCwd ? { execute: createWebFetchExecute(configCwd) } : {}),
    description: surface.description,
    promptSnippet: surface.promptSnippet,
    promptGuidelines: surface.promptGuidelines,
    renderCall: renderWebFetchCall,
    renderResult: renderWebFetchResult,
  });
}
