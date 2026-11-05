import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type ChildWebToolProvision, requestChildWebTools } from "@mrclrchtr/supi-core/session";

/**
 * Capture Reviewer Web Access for one Review invocation. Returns undefined when the setting
 * is off or the containing session provides no Web tools; Reviewers then lack Web tools.
 */
export function captureReviewerWebTools(
  enabled: boolean,
  events: Pick<ExtensionAPI["events"], "on" | "emit">,
  configCwd: string,
): ChildWebToolProvision | undefined {
  // Keep Web settings bound to the containing session, not the frozen Review Workspace.
  return enabled ? requestChildWebTools(events, { configCwd }) : undefined;
}
