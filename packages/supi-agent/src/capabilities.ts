import type { AgentCapabilityId } from "./types.ts";

/** Package-owned capability metadata used for validation and safety classification. */
export interface AgentCapability {
  readonly id: AgentCapabilityId;
  readonly toolName: string;
  readonly mutationCapable: boolean;
  readonly label: string;
  /** Conditional Capability: present only when the containing session provides it. */
  readonly conditional?: true;
}

const capabilityList: readonly AgentCapability[] = [
  { id: "read", toolName: "read", mutationCapable: false, label: "Read files" },
  { id: "grep", toolName: "grep", mutationCapable: false, label: "Search file contents" },
  { id: "find", toolName: "find", mutationCapable: false, label: "Find files" },
  { id: "ls", toolName: "ls", mutationCapable: false, label: "List directory contents" },
  { id: "bash", toolName: "bash", mutationCapable: true, label: "Run shell commands" },
  { id: "edit", toolName: "edit", mutationCapable: true, label: "Edit files" },
  { id: "write", toolName: "write", mutationCapable: true, label: "Write files" },
  {
    id: "code_resolve",
    toolName: "code_resolve",
    mutationCapable: false,
    label: "Resolve code symbols",
  },
  {
    id: "code_inspect",
    toolName: "code_inspect",
    mutationCapable: false,
    label: "Inspect code points",
  },
  {
    id: "code_orientation",
    toolName: "code_orientation",
    mutationCapable: false,
    label: "Orient around code",
  },
  {
    id: "code_graph",
    toolName: "code_graph",
    mutationCapable: false,
    label: "Inspect code relations",
  },
  {
    id: "code_find",
    toolName: "code_find",
    mutationCapable: false,
    label: "Find code structures",
  },
  {
    id: "code_health",
    toolName: "code_health",
    mutationCapable: false,
    label: "Inspect code health",
  },
  { id: "codemode", toolName: "codemode", mutationCapable: false, label: "Run tool scripts" },
  {
    id: "web_fetch_md",
    toolName: "web_fetch_md",
    mutationCapable: false,
    label: "Fetch web pages",
    conditional: true,
  },
  {
    id: "web_search",
    toolName: "web_search",
    mutationCapable: false,
    label: "Search the web",
    conditional: true,
  },
  {
    id: "web_docs_search",
    toolName: "web_docs_search",
    mutationCapable: false,
    label: "Search library docs",
    conditional: true,
  },
  {
    id: "web_docs_fetch",
    toolName: "web_docs_fetch",
    mutationCapable: false,
    label: "Fetch library docs",
    conditional: true,
  },
];

/** The complete fixed capability set; callers must not mutate this array. */
export const AGENT_CAPABILITIES: readonly AgentCapability[] = Object.freeze(
  capabilityList.map((capability) => Object.freeze(capability)),
);

const byId = new Map(AGENT_CAPABILITIES.map((capability) => [capability.id, capability]));

/** Return fixed capability metadata for an ID, or undefined when the ID is unknown. */
export function getAgentCapability(id: string): AgentCapability | undefined {
  return byId.get(id as AgentCapabilityId);
}

/** Return whether a profile may run concurrently with another profile. */
export function isReadOnlyCapabilitySet(tools: readonly AgentCapabilityId[]): boolean {
  return tools.every((tool) => byId.get(tool)?.mutationCapable === false);
}

/** Return whether the selected capabilities include a headless Code Intelligence tool. */
export function usesHeadlessInspection(tools: readonly AgentCapabilityId[]): boolean {
  return tools.some((tool) => tool.startsWith("code_"));
}

/** Return the profile's allowed Web Conditional Capabilities. */
export function selectedWebCapabilities(
  tools: readonly AgentCapabilityId[],
): Extract<AgentCapabilityId, `web_${string}`>[] {
  return tools.filter((tool): tool is Extract<AgentCapabilityId, `web_${string}`> =>
    tool.startsWith("web_"),
  );
}

/**
 * Return the capabilities a run actually receives: every unconditional capability plus
 * the allowed Conditional Capabilities that the containing session currently provides.
 */
export function effectiveCapabilities(
  tools: readonly AgentCapabilityId[],
  providedConditional: readonly string[],
): AgentCapabilityId[] {
  const provided = new Set(providedConditional);
  return tools.filter((tool) => byId.get(tool)?.conditional !== true || provided.has(tool));
}

/** Convert validated capability IDs to PI's tool allowlist. */
export function toAgentToolNames(tools: readonly AgentCapabilityId[]): string[] {
  return tools.map((tool) => byId.get(tool)?.toolName ?? tool);
}
