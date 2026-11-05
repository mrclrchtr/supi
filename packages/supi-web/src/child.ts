/** Child-session provision of Web tools for SuPi Agent Runs and Reviewer Sessions. */

import type { ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import {
  type ChildWebToolName,
  callableChildWebToolNames,
  provideChildWebTools,
} from "@mrclrchtr/supi-core/session";
import { registerWebDocsFetchTool } from "./tool/web_docs_fetch/register.ts";
import { WEB_DOCS_FETCH_TOOL_NAME } from "./tool/web_docs_fetch/spec.ts";
import { registerWebDocsSearchTool } from "./tool/web_docs_search/register.ts";
import { WEB_DOCS_SEARCH_TOOL_NAME } from "./tool/web_docs_search/spec.ts";
import { registerWebFetchMdTool } from "./tool/web_fetch_md/register.ts";
import { WEB_FETCH_MD_TOOL_NAME } from "./tool/web_fetch_md/spec.ts";
import { registerWebSearchTool } from "./tool/web_search/register.ts";
import { WEB_SEARCH_TOOL_NAME } from "./tool/web_search/spec.ts";

type Registrar = (pi: ExtensionAPI, configCwd: string) => void;

const registrars: Record<ChildWebToolName, Registrar> = {
  [WEB_FETCH_MD_TOOL_NAME]: registerWebFetchMdTool,
  [WEB_SEARCH_TOOL_NAME]: (pi) => registerWebSearchTool(pi),
  [WEB_DOCS_SEARCH_TOOL_NAME]: (pi) => registerWebDocsSearchTool(pi),
  [WEB_DOCS_FETCH_TOOL_NAME]: (pi) => registerWebDocsFetchTool(pi),
};

/**
 * Build a child-only factory that registers the selected Web tools without settings,
 * availability checks, or warnings. Availability was decided in the containing session,
 * and Web settings keep resolving from `configCwd`, the containing session's directory.
 */
export function createChildWebToolsFactory(
  toolNames: readonly ChildWebToolName[],
  configCwd: string,
): ExtensionFactory {
  const selected = [...new Set(toolNames)];
  return (pi) => {
    for (const name of selected) registrars[name](pi, configCwd);
  };
}

/** Answer child Web tool requests with the tools currently callable in this session. */
export function registerChildWebToolProvider(pi: ExtensionAPI): void {
  provideChildWebTools(pi.events, ({ configCwd }) => ({
    toolNames: callableChildWebToolNames(pi),
    createFactory: (toolNames) => createChildWebToolsFactory(toolNames, configCwd),
  }));
}
