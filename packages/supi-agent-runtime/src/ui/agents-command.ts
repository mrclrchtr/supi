import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AgentRunRegistry } from "../session/agent-run-registry.ts";
import type { AgentRunRegistrySnapshot } from "../session/agent-run-registry-types.ts";
import {
  findRuntimeState,
  runtimeState,
  type SharedRuntimeState,
} from "../session/runtime-state.ts";
import type {
  AgentsOverlayData,
  AgentsOverlayRun,
  AgentsProfilePages,
} from "./agents-overlay-data.ts";

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
  let formStarted = false;
  let mounted = false;
  let closeViewer: (() => void) | undefined;
  const removeAskUserStart = pi.events.on("supi:ask-user:start", () => {
    formStarted = true;
    if (mounted) closeViewer?.();
  });
  try {
    const { AgentsDialog } = await import("./agents-overlay.ts");
    if (formStarted) return;
    await ctx.ui.custom<void>(
      (tui, theme, keybindings, done) => {
        closeViewer = () => done(undefined);
        return new AgentsDialog(
          buildOverlayData(state.registry.snapshot(), profilePagesFor(state)),
          {
            theme,
            tui,
            keybindings,
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
        /** Wait for mounting so Pi's close callback removes this overlay, not an earlier one. */
        onHandle: () => {
          mounted = true;
          if (formStarted) closeViewer?.();
        },
      },
    );
  } finally {
    closeViewer = undefined;
    removeAskUserStart();
  }
}

/** Remove the Agent-owned Profile pages when their provider extension shuts down. */
export function clearAgentsProfilePages(pi: ExtensionAPI): void {
  const state = findRuntimeState(pi);
  if (state?.profilePages?.owner === pi) state.profilePages = undefined;
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
