import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { AgentRunRegistry } from "../session/agent-run-registry.ts";
import type { AgentRunRegistrySnapshot } from "../session/agent-run-registry-types.ts";
import type {
  AgentsOverlayData,
  AgentsOverlayRun,
  AgentsProfilePages,
} from "./agents-overlay-data.ts";

interface SharedProcessState {
  readonly runtimes: Map<string, SharedRuntimeState>;
}

interface SharedRuntimeState {
  readonly id: string;
  readonly registry: AgentRunRegistry;
  commandRegistered: boolean;
  removeDiscoveryListener?: () => void;
  profilePages?: { readonly owner: object; readonly provider: AgentsProfilePages };
}

const sharedStateKey = Symbol.for("@mrclrchtr/supi-agent-runtime/agents-viewer");
const discoverChannel = "supi:agent-runtime:agents-viewer:discover";
const responseChannel = "supi:agent-runtime:agents-viewer:response";

function sharedProcessState(): SharedProcessState {
  const global = globalThis as unknown as Record<symbol, unknown>;
  const existing = global[sharedStateKey] as SharedProcessState | undefined;
  if (existing) return existing;
  const created: SharedProcessState = { runtimes: new Map() };
  global[sharedStateKey] = created;
  return created;
}

/** Find the shared state for the Pi runtime that owns this extension API. */
function runtimeState(pi: ExtensionAPI): SharedRuntimeState {
  const processState = sharedProcessState();
  const discovered = findRuntimeState(pi);
  if (discovered) return discovered;

  const state: SharedRuntimeState = {
    id: randomUUID(),
    registry: new AgentRunRegistry(),
    commandRegistered: false,
  };
  processState.runtimes.set(state.id, state);
  state.removeDiscoveryListener = pi.events.on(discoverChannel, (data) => {
    if (!isRequest(data)) return;
    pi.events.emit(responseChannel, { requestId: data.requestId, runtimeId: state.id });
  });
  pi.on("session_start", () => state.registry.openSession());
  pi.on("session_shutdown", async () => {
    state.profilePages = undefined;
    await state.registry.clear();
    state.removeDiscoveryListener?.();
    state.removeDiscoveryListener = undefined;
    processState.runtimes.delete(state.id);
  });
  return state;
}

function isRequest(data: unknown): data is { requestId: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    "requestId" in data &&
    typeof data.requestId === "string"
  );
}

function isResponse(data: unknown): data is { requestId: string; runtimeId: string } {
  return isRequest(data) && "runtimeId" in data && typeof data.runtimeId === "string";
}

/** Return the Agent Run registry for the containing Pi runtime. */
export function getAgentRunRegistry(pi: ExtensionAPI): AgentRunRegistry {
  return runtimeState(pi).registry;
}

/** Optional Agent-owned data for the Profiles and Profile Diagnostics pages. */
export interface RegisterAgentsCommandOptions {
  readonly profilePages?: AgentsProfilePages;
}

/** Register `/agents` once for a Pi runtime and return its shared run registry. */
export function registerAgentsCommand(
  pi: ExtensionAPI,
  options: RegisterAgentsCommandOptions = {},
): AgentRunRegistry {
  const state = runtimeState(pi);
  if (options.profilePages) state.profilePages = { owner: pi, provider: options.profilePages };
  if (state.commandRegistered) return state.registry;

  pi.registerCommand("agents", {
    description: "Inspect managed runs and, when available, Agent Profiles",
    handler: async (_args, ctx) => showAgentsViewer(pi, state, ctx),
  });
  state.commandRegistered = true;
  return state.registry;
}

/** Open the shared `/agents` viewer from another interactive extension flow. */
export function openAgentsViewer(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
  return showAgentsViewer(pi, runtimeState(pi), ctx);
}

async function showAgentsViewer(
  pi: ExtensionAPI,
  state: SharedRuntimeState,
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("/agents is available only in TUI mode.", "warning");
    return;
  }
  const [{ Key, matchesKey }, { AgentsDialog }] = await Promise.all([
    import("@earendil-works/pi-tui"),
    import("./agents-overlay.ts"),
  ]);
  let closeOverlay: (() => void) | undefined;
  let askUserActive = false;
  const removeAskUserStart = pi.events.on("supi:ask-user:start", () => {
    askUserActive = true;
  });
  const removeAskUserEnd = pi.events.on("supi:ask-user:end", () => {
    askUserActive = false;
  });
  const removeAskUserInput = ctx.ui.onTerminalInput?.((data) => {
    if (!askUserActive || !closeOverlay || !matchesKey(data, Key.escape)) return;
    closeOverlay();
    return { consume: true };
  });
  try {
    await ctx.ui.custom<void>(
      (tui, theme, _keybindings, done) => {
        closeOverlay = () => done(undefined);
        return new AgentsDialog(
          buildOverlayData(state.registry.snapshot(), profilePagesFor(state)),
          {
            theme,
            tui,
            done: () => done(undefined),
            onSteer: (runKey, message) => state.registry.steer(runKey, message),
            onStop: (runKey) => state.registry.stop(runKey),
            subscribe: (listener) =>
              state.registry.subscribe((snapshot) =>
                listener(buildOverlayData(snapshot, profilePagesFor(state))),
              ),
          },
        );
      },
      {
        overlay: true,
        overlayOptions: {
          anchor: "top-left",
          width: "100%",
          maxHeight: "100%",
          margin: 0,
        },
      },
    );
  } finally {
    removeAskUserInput?.();
    removeAskUserStart();
    removeAskUserEnd();
  }
}

/** Remove the Agent-owned Profile pages when their provider extension shuts down. */
export function clearAgentsProfilePages(pi: ExtensionAPI): void {
  const state = findRuntimeState(pi);
  if (state?.profilePages?.owner === pi) state.profilePages = undefined;
}

function findRuntimeState(pi: ExtensionAPI): SharedRuntimeState | undefined {
  const processState = sharedProcessState();
  const requestId = randomUUID();
  let discoveredId: string | undefined;
  const removeResponseListener = pi.events.on(responseChannel, (data) => {
    if (!isResponse(data) || data.requestId !== requestId) return;
    discoveredId = data.runtimeId;
  });
  pi.events.emit(discoverChannel, { requestId });
  removeResponseListener();
  return discoveredId ? processState.runtimes.get(discoveredId) : undefined;
}

function profilePagesFor(state: SharedRuntimeState) {
  return state.profilePages?.provider.getData();
}

function buildOverlayData(
  snapshot: AgentRunRegistrySnapshot,
  profilePages: AgentsOverlayData["profilePages"],
): AgentsOverlayData {
  const runs: AgentsOverlayRun[] = snapshot.runs.map((run) => ({
    ...run,
    key: `run:${run.runKey}`,
  }));
  return {
    runs,
    ...(profilePages ? { profilePages } : {}),
  };
}
