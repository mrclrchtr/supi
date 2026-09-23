import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SessionCapabilityState } from "@mrclrchtr/supi-core/session";
import { isExtensionTool } from "./session-capabilities-state.ts";
import type { CapabilityToolItem } from "./session-capabilities-ui.ts";

/** Enforce the current session tool choices without changing other active tools. */
export function applyToolDenylist(
  pi: ExtensionAPI,
  state: SessionCapabilityState,
  restoreNames: readonly string[],
  restorableNames: ReadonlySet<string>,
): void {
  const available = new Set(
    pi
      .getAllTools()
      .filter(isExtensionTool)
      .map((tool) => tool.name),
  );
  const eligible = new Set(state.eligibleToolNames);
  const initiallyInactive = new Set(state.initiallyInactiveToolNames);
  const denied = new Set(
    state.toolDenylist.filter(
      (name) => available.has(name) && eligible.has(name) && !initiallyInactive.has(name),
    ),
  );
  const active = pi.getActiveTools();
  const activeSet = new Set(active);
  const next = active.filter((name) => !denied.has(name));
  const nextSet = new Set(next);

  for (const name of restoreNames) {
    if (
      available.has(name) &&
      eligible.has(name) &&
      restorableNames.has(name) &&
      !initiallyInactive.has(name) &&
      !denied.has(name) &&
      !activeSet.has(name) &&
      !nextSet.has(name)
    ) {
      next.push(name);
      nextSet.add(name);
    }
  }

  if (next.length !== active.length || next.some((name, index) => name !== active[index])) {
    pi.setActiveTools(next);
  }
}

/** Add a late tool to the restore boundary only when PI has activated it. */
export function observeNewTools(
  pi: ExtensionAPI,
  state: SessionCapabilityState,
  knownToolNames: Set<string>,
  restorableToolNames: Set<string>,
): void {
  const activeNames = new Set(pi.getActiveTools());
  const initiallyInactive = new Set(state.initiallyInactiveToolNames);
  for (const tool of pi.getAllTools().filter(isExtensionTool)) {
    if (knownToolNames.has(tool.name)) continue;
    knownToolNames.add(tool.name);
    if (activeNames.has(tool.name) && !initiallyInactive.has(tool.name)) {
      restorableToolNames.add(tool.name);
    }
  }
}

/** Reconcile known tools while retaining restrictions for tools not registered yet. */
export function reconcileToolInventory(
  pi: ExtensionAPI,
  state: SessionCapabilityState,
): { tools: CapabilityToolItem[]; changed: boolean } {
  const tools = pi.getAllTools().filter(isExtensionTool);
  const activeNames = new Set(pi.getActiveTools());
  const previous = JSON.stringify(state);
  const initiallyInactive = new Set(state.initiallyInactiveToolNames);
  const eligible = new Set(state.eligibleToolNames.filter((name) => !initiallyInactive.has(name)));

  for (const tool of tools) {
    if (activeNames.has(tool.name) && !initiallyInactive.has(tool.name)) eligible.add(tool.name);
  }

  state.initiallyInactiveToolNames = Array.from(initiallyInactive);
  state.eligibleToolNames = Array.from(eligible);
  state.toolDenylist = state.toolDenylist.filter((name) => eligible.has(name));
  state.toolEnabledNames = (state.toolEnabledNames ?? []).filter(
    (name) => eligible.has(name) && !state.toolDenylist.includes(name),
  );

  const denied = new Set(state.toolDenylist);
  const visibleTools = tools.filter(
    (tool) => eligible.has(tool.name) && (activeNames.has(tool.name) || denied.has(tool.name)),
  );
  return {
    tools: visibleTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      source: tool.sourceInfo.source,
    })),
    changed: previous !== JSON.stringify(state),
  };
}
