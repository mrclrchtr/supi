/**
 * SuPi Web Context7 extension — registers web_docs_search and web_docs_fetch tools.
 *
 * API key is read automatically from the CONTEXT7_API_KEY environment variable.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerWebDocsFetchTool } from "./tool/web_docs_fetch/register.ts";
import { registerWebDocsSearchTool } from "./tool/web_docs_search/register.ts";

export default function docsExtension(pi: ExtensionAPI): void {
  registerWebDocsSearchTool(pi);
  registerWebDocsFetchTool(pi);
}
