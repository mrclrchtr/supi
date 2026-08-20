// Compatibility aggregator for the per-tool web specs and prompt surfaces.

import type { TSchema } from "typebox";
import {
  toolDescription as docsFetchDescription,
  promptGuidelines as docsFetchGuidelines,
  promptSnippet as docsFetchSnippet,
} from "./web_docs_fetch/guidance.ts";
import {
  WEB_DOCS_FETCH_TOOL_LABEL,
  WEB_DOCS_FETCH_TOOL_NAME,
  webDocsFetchParameters,
} from "./web_docs_fetch/spec.ts";
import {
  toolDescription as searchDescription,
  promptGuidelines as searchGuidelines,
  promptSnippet as searchSnippet,
} from "./web_docs_search/guidance.ts";
import {
  WEB_DOCS_SEARCH_TOOL_LABEL,
  WEB_DOCS_SEARCH_TOOL_NAME,
  webDocsSearchParameters,
} from "./web_docs_search/spec.ts";
import {
  toolDescription as fetchDescription,
  promptGuidelines as fetchGuidelines,
  promptSnippet as fetchSnippet,
  getWebFetchPromptSurface,
} from "./web_fetch_md/guidance.ts";
import {
  WEB_FETCH_MD_TOOL_LABEL,
  WEB_FETCH_MD_TOOL_NAME,
  webFetchMdParameters,
} from "./web_fetch_md/spec.ts";

export type { WebDocsFetchInput } from "./web_docs_fetch/spec.ts";
export { WEB_DOCS_FETCH_TOOL_NAME } from "./web_docs_fetch/spec.ts";
export type { WebDocsSearchInput } from "./web_docs_search/spec.ts";
export { WEB_DOCS_SEARCH_TOOL_NAME } from "./web_docs_search/spec.ts";
export type { WebFetchMdInput, WebFetchOutputMode } from "./web_fetch_md/spec.ts";
export { WEB_FETCH_INLINE_MAX_CHARS, WEB_FETCH_MD_TOOL_NAME } from "./web_fetch_md/spec.ts";

export const WEB_TOOL_NAMES = [
  WEB_FETCH_MD_TOOL_NAME,
  WEB_DOCS_SEARCH_TOOL_NAME,
  WEB_DOCS_FETCH_TOOL_NAME,
] as const;
export type WebToolName = (typeof WEB_TOOL_NAMES)[number];

/** Prompt metadata sent to pi for a single web tool. */
export interface WebToolPromptSurface {
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
}

export interface WebToolSpec {
  name: WebToolName;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: readonly string[];
  parameters: TSchema;
}

export const WEB_TOOL_SPECS = [
  {
    name: WEB_FETCH_MD_TOOL_NAME,
    label: WEB_FETCH_MD_TOOL_LABEL,
    description: fetchDescription,
    promptSnippet: fetchSnippet,
    promptGuidelines: fetchGuidelines,
    parameters: webFetchMdParameters,
  },
  {
    name: WEB_DOCS_SEARCH_TOOL_NAME,
    label: WEB_DOCS_SEARCH_TOOL_LABEL,
    description: searchDescription,
    promptSnippet: searchSnippet,
    promptGuidelines: searchGuidelines,
    parameters: webDocsSearchParameters,
  },
  {
    name: WEB_DOCS_FETCH_TOOL_NAME,
    label: WEB_DOCS_FETCH_TOOL_LABEL,
    description: docsFetchDescription,
    promptSnippet: docsFetchSnippet,
    promptGuidelines: docsFetchGuidelines,
    parameters: webDocsFetchParameters,
  },
] as const satisfies readonly WebToolSpec[];

export function getWebToolSpec(name: WebToolName): WebToolSpec {
  const spec = WEB_TOOL_SPECS.find((candidate) => candidate.name === name);
  if (!spec) throw new Error(`Unknown web tool: ${name}`);
  return spec;
}

/** Runtime prompt surface, including environment-dependent guidance. */
export function getWebToolPromptSurface(name: WebToolName): WebToolPromptSurface {
  if (name === WEB_FETCH_MD_TOOL_NAME) {
    return getWebFetchPromptSurface();
  }
  const spec = getWebToolSpec(name);
  return {
    description: spec.description,
    promptSnippet: spec.promptSnippet,
    promptGuidelines: [...spec.promptGuidelines],
  };
}
