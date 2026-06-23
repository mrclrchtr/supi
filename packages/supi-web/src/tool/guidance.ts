import { spawnSync } from "node:child_process";
import { getWebToolSpec, WEB_FETCH_MD_TOOL_NAME, type WebToolName } from "./tool-specs.ts";

/** Prompt metadata sent to pi for a single web tool. */
export interface WebToolPromptSurface {
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
}

/** Build prompt metadata from the shared tool specs, adding runtime-specific guidance when useful. */
export function getWebToolPromptSurface(name: WebToolName): WebToolPromptSurface {
  const spec = getWebToolSpec(name);
  const promptGuidelines = [...spec.promptGuidelines];

  if (name === WEB_FETCH_MD_TOOL_NAME && isGhAvailable()) {
    promptGuidelines.push(
      "Use bash with the `gh` CLI instead of web_fetch_md for GitHub URLs when `gh` is available.",
    );
  }

  return {
    description: spec.description,
    promptSnippet: spec.promptSnippet,
    promptGuidelines,
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
