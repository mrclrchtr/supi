import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { promptGuidelines, promptSnippet, toolDescription } from "./guidance.ts";
import { cacheForensicsSpec } from "./spec.ts";

/** Register the cache_forensics agent tool. */
export function registerCacheForensicsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    ...cacheForensicsSpec,
    description: toolDescription,
    promptSnippet,
    promptGuidelines,
  });
}
