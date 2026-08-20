import { spawnSync } from "node:child_process";
import { MODEL_OUTPUT_LIMIT_DESCRIPTION } from "../result.ts";
import type { WebToolPromptSurface } from "../tool-specs.ts";
import { WEB_FETCH_INLINE_MAX_CHARS } from "./spec.ts";

export const toolDescription = `Fetch public http(s) URL as Markdown. Not for login/private pages. output_mode auto inlines <=${WEB_FETCH_INLINE_MAX_CHARS.toLocaleString()} chars else temp; inline may truncate; file returns a temp path. Links are absolute by default. ${MODEL_OUTPUT_LIMIT_DESCRIPTION}`;

export const promptSnippet = "web_fetch_md: public URL to Markdown";

export const promptGuidelines = ["Use web_fetch_md only for public http(s); ask if login/private."];

/** Runtime prompt surface; adds gh guidance when the gh CLI is available. */
export function getWebFetchPromptSurface(): WebToolPromptSurface {
  const guidelines = [...promptGuidelines];
  if (isGhAvailable()) {
    guidelines.push("Use `gh` CLI instead of web_fetch_md for GitHub URLs.");
  }
  return {
    description: toolDescription,
    promptSnippet,
    promptGuidelines: guidelines,
  };
}

function isGhAvailable(): boolean {
  try {
    const result = spawnSync("gh", ["--version"], { stdio: "ignore" });
    return result.status === 0;
  } catch {
    return false;
  }
}
