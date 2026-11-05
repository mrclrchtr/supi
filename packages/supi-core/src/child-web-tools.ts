// Session-provided Web tools for SuPi child sessions (Agent Runs and Reviewer Sessions).
//
// The loaded supi-web extension answers a synchronous request on the parent event bus.
// Consumers never depend on supi-web; when it is absent or provides no tools, the
// request returns undefined and the child simply lacks Web tools.

import type { ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";

/** Web tools that child sessions may receive when the containing session provides them. */
export const CHILD_WEB_TOOL_NAMES = [
  "web_fetch_md",
  "web_search",
  "web_docs_search",
  "web_docs_fetch",
] as const;

/** One session-provided Web tool name. */
export type ChildWebToolName = (typeof CHILD_WEB_TOOL_NAMES)[number];

/**
 * Web tools currently callable in the containing session plus a child-only extension
 * factory that registers them. The factory must not capture the parent session; it may
 * capture plain data such as the containing session's configuration directory.
 */
export interface ChildWebToolProvision {
  readonly toolNames: readonly ChildWebToolName[];
  /** Register the requested subset of `toolNames` in a child session. */
  readonly createFactory: (toolNames: readonly ChildWebToolName[]) => ExtensionFactory;
}

/** Plain containing-session data supplied with a child Web tool request. */
export interface ChildWebToolsRequestContext {
  /**
   * Working directory whose SuPi configuration governs Web settings such as Firecrawl.
   * Children with a different cwd (for example a frozen Review Workspace) keep this policy.
   */
  readonly configCwd: string;
}

type EventBusLike = Pick<ExtensionAPI["events"], "on" | "emit">;

const REQUEST_CHANNEL = "supi:child-web-tools:request";
const RESPONSE_CHANNEL = "supi:child-web-tools:response";

interface ChildWebToolsRequest extends ChildWebToolsRequestContext {
  readonly requestId: string;
}

interface ChildWebToolsResponse {
  readonly requestId: string;
  readonly provision: ChildWebToolProvision;
}

let nextRequestId = 0;

/**
 * Answer child Web tool requests on the parent event bus. The callback must be synchronous
 * because Pi's event bus does not await listeners. Returns an unsubscribe function.
 */
export function provideChildWebTools(
  events: EventBusLike,
  resolve: (context: ChildWebToolsRequestContext) => ChildWebToolProvision | undefined,
): () => void {
  return events.on(REQUEST_CHANNEL, (data) => {
    const request = data as Partial<ChildWebToolsRequest> | undefined;
    if (typeof request?.requestId !== "string" || typeof request.configCwd !== "string") return;
    const { requestId, configCwd } = request;
    const provision = resolve({ configCwd });
    if (!provision || provision.toolNames.length === 0) return;
    events.emit(RESPONSE_CHANNEL, { requestId, provision } satisfies ChildWebToolsResponse);
  });
}

/** Capture the Web tools the containing session currently provides, if any. */
export function requestChildWebTools(
  events: EventBusLike,
  context: ChildWebToolsRequestContext,
): ChildWebToolProvision | undefined {
  const requestId = `child-web-${process.pid}-${++nextRequestId}`;
  let provision: ChildWebToolProvision | undefined;
  const unsubscribe = events.on(RESPONSE_CHANNEL, (data) => {
    const response = data as Partial<ChildWebToolsResponse> | undefined;
    if (response?.requestId === requestId && response.provision) provision = response.provision;
  });
  try {
    events.emit(REQUEST_CHANNEL, { requestId, ...context } satisfies ChildWebToolsRequest);
  } finally {
    unsubscribe();
  }
  return provision;
}

/**
 * Return the Web tools callable in a session under Pi's exposure rules: active `direct`
 * tools, plus registered `codemode` and `deferred` tools. `model-only` and `hidden`
 * tools are not callable.
 */
export function callableChildWebToolNames(
  pi: Pick<ExtensionAPI, "getAllTools" | "getActiveTools">,
): ChildWebToolName[] {
  const active = new Set(pi.getActiveTools());
  const exposures = new Map(
    pi.getAllTools().map((tool) => [tool.name, tool.exposure ?? "direct"] as const),
  );
  return CHILD_WEB_TOOL_NAMES.filter((name) => {
    const exposure = exposures.get(name);
    if (exposure === "direct") return active.has(name);
    return exposure === "codemode" || exposure === "deferred";
  });
}
