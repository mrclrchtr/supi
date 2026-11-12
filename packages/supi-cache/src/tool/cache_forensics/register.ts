import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CACHE_TOOL_NAMESPACE } from "../namespace.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "./guidance.ts";
import { cacheForensicsSpec } from "./spec.ts";

/** Register the cache_forensics agent tool. */
export function registerCacheForensicsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    ...cacheForensicsSpec,
    namespace: CACHE_TOOL_NAMESPACE,
    description: toolDescription,
    promptSnippet,
    promptGuidelines,
  });
}
