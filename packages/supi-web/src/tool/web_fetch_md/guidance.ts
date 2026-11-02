import type { WebToolPromptSurface } from "../tool-specs.ts";
import { WEB_FETCH_INLINE_MAX_CHARS } from "./spec.ts";

export const toolDescription = `Fetch public http(s) pages as best-effort Markdown, directly or via opt-in Firecrawl for JS-rendered pages. Not for login, private, or paywalled pages. Direct fetching is not network-isolated. Use gh for GitHub URLs when available. Auto returns up to ${WEB_FETCH_INLINE_MAX_CHARS.toLocaleString()} chars inline, otherwise a temp file. Native Markdown is unchanged; HTML links default to absolute.`;

export const promptSnippet = "fetch a public URL as Markdown";

export const promptGuidelines: string[] = [];

/** Return the static prompt surface for web_fetch_md. */
export function getWebFetchPromptSurface(): WebToolPromptSurface {
  return {
    description: toolDescription,
    promptSnippet,
    promptGuidelines,
  };
}
