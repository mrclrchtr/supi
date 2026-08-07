import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveProfileDefinition } from "../profile-catalogue.ts";
import { agentProfileCatalogueStore } from "../session.ts";
import type {
  AgentRunRegistry,
  AgentRunRegistrySnapshot,
  BatchTaskResult,
} from "../tool/registry.ts";
import type { ProfileCatalogue, ProfileDiagnostic } from "../types.ts";
import { AgentsDialog } from "./agents-overlay.ts";
import type {
  AgentsOverlayData,
  AgentsOverlayProfile,
  AgentsOverlayRun,
} from "./agents-overlay-data.ts";

const MAX_OVERLAY_DIAGNOSTICS = 20;

/** Register the TUI-only /agents Agent Run inspector. */
export function registerAgentsCommand(pi: ExtensionAPI, registry: AgentRunRegistry): void {
  pi.registerCommand("agents", {
    description: "Inspect Agent Runs and Agent Profiles",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/agents is available only in TUI mode.", "warning");
        return;
      }

      const catalogue = agentProfileCatalogueStore.get();
      await ctx.ui.custom<void>(
        (tui, theme, _keybindings, done) =>
          new AgentsDialog(buildOverlayData(catalogue, registry.snapshot()), {
            theme,
            tui,
            done: () => done(undefined),
            onSteer: async (taskId) => {
              const message = await ctx.ui.input(`Steer ${taskId}`, "Steering message");
              if (!message?.trim()) return "canceled";
              return registry.steer(taskId, message.trim());
            },
            onStop: (taskId) => registry.stop(taskId),
            subscribe: (listener) =>
              registry.subscribe((snapshot) => listener(buildOverlayData(catalogue, snapshot))),
          }),
        {
          overlay: true,
          overlayOptions: {
            anchor: "center",
            width: "80%",
            minWidth: 60,
            maxHeight: "90%",
            visible: (terminalWidth: number) => terminalWidth >= 60,
          },
        },
      );
    },
  });
}

function buildOverlayData(
  catalogue: ProfileCatalogue | undefined,
  snapshot: AgentRunRegistrySnapshot,
): AgentsOverlayData {
  const activeRuns: AgentsOverlayRun[] = snapshot.activeRuns.map((run) => ({
    key: `active:${run.taskId}`,
    active: true,
    taskId: run.taskId,
    profileId: run.profileId,
    status: run.status,
    modelId: run.modelId,
    thinkingLevel: run.thinkingLevel,
    turns: run.turns,
    toolUses: run.toolUses,
    usage: run.usage,
    recentActivity: run.recentActivity,
    humanTruncated: false,
    modelTruncated: false,
    taskMetadata: run.taskMetadata,
    ...(snapshot.activeSharedContext === undefined
      ? {}
      : { sharedContext: snapshot.activeSharedContext }),
    conversationView: run.conversationView,
  }));
  const lastRuns =
    snapshot.lastBatch?.tasks.map((task, index) =>
      completedRun(
        task,
        index,
        snapshot.lastBatch?.conversationViews[task.taskId],
        snapshot.lastBatch?.sharedContext,
      ),
    ) ?? [];
  const diagnostics = boundedDiagnostics(catalogue?.diagnostics ?? []);

  return {
    runs: [...activeRuns, ...lastRuns],
    profiles:
      catalogue?.profiles
        .filter(
          (profile) =>
            catalogue.profileIds.includes(profile.id) ||
            "code" in resolveProfileDefinition(profile),
        )
        .map(profileView) ?? [],
    diagnostics: diagnostics.visible,
    omittedDiagnosticCount: diagnostics.omitted,
    omittedProfileCount: catalogue?.omittedProfileCount ?? 0,
  };
}

function completedRun(
  task: BatchTaskResult,
  index: number,
  conversationView: AgentsOverlayRun["conversationView"],
  sharedContext?: string,
): AgentsOverlayRun {
  return {
    key: `last:${index}:${task.taskId}`,
    active: false,
    taskId: task.taskId,
    profileId: task.profileId,
    status: task.status,
    modelId: task.modelId,
    thinkingLevel: task.thinkingLevel,
    turns: task.turns,
    toolUses: task.toolUses,
    usage: task.usage,
    humanTruncated: task.humanTruncated,
    modelTruncated: task.modelTruncated,
    taskMetadata: task.taskMetadata ?? conversationView?.taskMetadata,
    ...(sharedContext === undefined ? {} : { sharedContext }),
    conversationView,
  };
}

function profileView(entry: ProfileCatalogue["profiles"][number]): AgentsOverlayProfile {
  const profile = resolveProfileDefinition(entry);
  if ("code" in profile) {
    return {
      id: entry.id,
      description: entry.description,
      unavailable: profile.message,
    };
  }
  return {
    id: profile.id,
    description: profile.manifest.description,
    source: profile.source,
    directory: profile.directory,
    model: profile.manifest.model ?? "inherit",
    thinking: profile.manifest.thinking ?? "inherit",
    ...(profile.manifest.timeoutMinutes === undefined
      ? {}
      : { timeoutMinutes: profile.manifest.timeoutMinutes }),
    tools: profile.manifest.tools,
    systemPrompt: profile.manifest.systemPrompt,
    instructionScopes: profile.manifest.instructionScopes,
    ...(profile.fieldSources === undefined ? {} : { fieldSources: profile.fieldSources }),
  };
}

function boundedDiagnostics(diagnostics: readonly ProfileDiagnostic[]): {
  visible: readonly ProfileDiagnostic[];
  omitted: number;
} {
  const ordered = [...diagnostics].sort((left, right) => {
    if (left.code === right.code) return 0;
    if (left.code === "catalogue-overflow") return -1;
    if (right.code === "catalogue-overflow") return 1;
    return 0;
  });
  return {
    visible: ordered.slice(0, MAX_OVERLAY_DIAGNOSTICS),
    omitted: Math.max(0, ordered.length - MAX_OVERLAY_DIAGNOSTICS),
  };
}
