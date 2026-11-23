import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { BackgroundRunBatches } from "../background/controller.ts";
import type { AgentsProfilePages } from "../ui/agents-overlay-data.ts";
import { AgentRunRegistry } from "./agent-run-registry.ts";

interface SharedProcessState {
  readonly runtimes: Map<string, SharedRuntimeState>;
}

/**
 * Session-local state shared by every bundled runtime copy in one Pi runtime. Copies discover it
 * through the Pi event bus, so the shape must stay compatible across runtime versions.
 */
export interface SharedRuntimeState {
  readonly id: string;
  readonly registry: AgentRunRegistry;
  commandRegistered: boolean;
  removeDiscoveryListener?: () => void;
  profilePages?: { readonly owner: object; readonly provider: AgentsProfilePages };
  /** Background Run Batches of the current session; created when the first owner registers. */
  background?: BackgroundRunBatches;
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

/** Find or create the shared state for the Pi runtime that owns this extension API. */
export function runtimeState(pi: ExtensionAPI): SharedRuntimeState {
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
    // Stop owned batches before the registry releases their runs; closing twice is harmless.
    await state.background?.close();
    state.background = undefined;
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

/** Find the shared state of this Pi runtime without creating one. */
export function findRuntimeState(pi: ExtensionAPI): SharedRuntimeState | undefined {
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
