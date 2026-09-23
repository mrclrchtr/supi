import type { ExtensionAPI, ToolInfo } from "@earendil-works/pi-coding-agent";
import {
  createEmptySessionCapabilityState,
  type SessionCapabilityState,
} from "@mrclrchtr/supi-core/session";

/** Startup tool names that the session selector may change. */
export interface ToolBaseline {
  eligibleToolNames: string[];
  initiallyInactiveToolNames: string[];
}

/** Return true when PI reports a non-built-in tool source. */
export function isExtensionTool(tool: ToolInfo): boolean {
  return tool.sourceInfo.source !== "builtin" && tool.sourceInfo.source !== "sdk";
}

/** Capture the PI tool set before session overrides run. */
export function captureToolBaseline(pi: ExtensionAPI): ToolBaseline {
  const tools = pi.getAllTools().filter(isExtensionTool);
  const activeNames = new Set(pi.getActiveTools());
  const eligibleToolNames = tools
    .filter((tool) => activeNames.has(tool.name))
    .map((tool) => tool.name);
  const eligible = new Set(eligibleToolNames);
  return {
    eligibleToolNames,
    initiallyInactiveToolNames: tools
      .filter((tool) => !eligible.has(tool.name))
      .map((tool) => tool.name),
  };
}

/** Copy the startup baseline from one saved session state. */
export function baselineFromState(state: SessionCapabilityState): ToolBaseline {
  return {
    eligibleToolNames: [...state.eligibleToolNames],
    initiallyInactiveToolNames: [...state.initiallyInactiveToolNames],
  };
}

/** Add new active tools but keep the startup allowlist boundary. */
export function addActiveToolsToBaseline(pi: ExtensionAPI, baseline: ToolBaseline): void {
  const eligible = new Set(baseline.eligibleToolNames);
  const initiallyInactive = new Set(baseline.initiallyInactiveToolNames);
  const active = new Set(pi.getActiveTools());
  for (const tool of pi.getAllTools().filter(isExtensionTool)) {
    if (active.has(tool.name) && !initiallyInactive.has(tool.name)) eligible.add(tool.name);
  }
  baseline.eligibleToolNames = Array.from(eligible);
}

/** Build a new session with no tool visibility overrides. */
export function initialSessionCapabilityState(baseline: ToolBaseline): SessionCapabilityState {
  return {
    ...createEmptySessionCapabilityState(),
    eligibleToolNames: [...baseline.eligibleToolNames],
    initiallyInactiveToolNames: [...baseline.initiallyInactiveToolNames],
  };
}
