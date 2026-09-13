import type { WebToolPromptSurface } from "../tool-specs.ts";
import { WEB_FETCH_INLINE_MAX_CHARS } from "./spec.ts";

export const toolDescription = `Fetch a public http(s) URL as Markdown. Not for login or private pages. Use gh for GitHub URLs when available. output_mode auto returns up to ${WEB_FETCH_INLINE_MAX_CHARS.toLocaleString()} characters inline and otherwise returns a temporary-file path; file always returns a temporary-file path. Links are absolute by default.`;

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
