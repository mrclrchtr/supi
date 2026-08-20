/**
 * SuPi Web extension entry point — registers the `web_fetch_md` tool with pi.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerWebFetchMdTool } from "./tool/web_fetch_md/register.ts";

export default function webExtension(pi: ExtensionAPI): void {
  registerWebFetchMdTool(pi);
}
