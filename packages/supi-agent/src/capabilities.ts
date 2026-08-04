import type { AgentCapabilityId } from "./types.ts";

/** Package-owned capability metadata used for validation and safety classification. */
export interface AgentCapability {
  readonly id: AgentCapabilityId;
  readonly toolName: string;
  readonly mutationCapable: boolean;
  readonly label: string;
}

const capabilityList: readonly AgentCapability[] = [
  { id: "read", toolName: "read", mutationCapable: false, label: "Read files" },
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

/** Convert validated capability IDs to PI's tool allowlist. */
export function toAgentToolNames(tools: readonly AgentCapabilityId[]): string[] {
  return tools.map((tool) => byId.get(tool)?.toolName ?? tool);
}
