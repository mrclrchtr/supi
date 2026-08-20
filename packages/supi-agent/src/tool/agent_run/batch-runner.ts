import type { Usage } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgentRunHandle, AgentRunSessionView } from "@mrclrchtr/supi-agent-runtime/api";
import { combineAgentRunUsage, startAgentRun } from "@mrclrchtr/supi-agent-runtime/api";
import { toAgentToolNames } from "../../capabilities.ts";
import type { AgentProfile, ProfileCatalogue } from "../../types.ts";
import { type AggregateSection, boundAggregateOutput } from "./aggregate.ts";
import type { ResolvedTask } from "./batch-preflight.ts";
import { preflightDelegationBatch } from "./batch-preflight.ts";
import type { AgentConversationView, ConversationTaskMetadata } from "./conversation-view.ts";
import { buildConversationView } from "./conversation-view.ts";
import { capHumanText, capModelText, humanTextOverflow, modelTextOverflow } from "./output.ts";
import type {
  AgentRunRegistry,
  BatchProgressState,
  BatchTaskProgress,
  BatchTaskResult,
} from "./registry.ts";
import {
  AgentRunTelemetry,
  failureCodeFromOutcome,
  recordAgentRunOutcomeDebug,
  statusFromOutcome,
} from "./run-telemetry.ts";
import type { AgentRunToolParams } from "./schema.ts";
import { summarizeToolActivity } from "./tool-summary.ts";

// ── Progress ─────────────────────────────────────────────────────

type OnUpdate = (details: BatchProgressState) => void;

// ── Mapper helpers ───────────────────────────────────────────────

// ── Build child prompt ──────────────────────────────────────────

function buildChildPrompt(input: { sharedContext?: string; instructions: string }): string {
  if (!input.sharedContext?.trim()) return input.instructions;
  return `${input.sharedContext.trim()}\n\n${input.instructions}`;
}

// ── Execute batch ────────────────────────────────────────────────

/**
 * Preflight a Delegation Batch atomically, execute every Agent Run, and return ordered results
 * with aggregate usage. The caller owns the registry for active-run tracking and shutdown.
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: batch execution stays in one audited function.
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: batch lifecycle orchestration stays in one audited function.
// biome-ignore lint/complexity/useMaxParams: batch orchestration needs catalogue, context, registry.
export async function runDelegationBatch(
  params: AgentRunToolParams,
  catalogue: ProfileCatalogue,
  ctx: ExtensionContext,
  onUpdate?: OnUpdate,
  registry?: AgentRunRegistry,
): Promise<{
  modelText: string;
  fullOutputPath?: string;
  results: BatchTaskResult[];
  aggregateUsage?: Usage;
  conversationViews: Map<string, AgentConversationView>;
}> {
  const preflightResult = preflightDelegationBatch(params, catalogue, ctx);
  if ("errors" in preflightResult) {
    const message = preflightResult.errors
      .map((err) => `${err.taskId ? `${err.taskId}: ` : ""}${err.message}`)
      .join("\n");
    throw new Error(`Delegation Batch preflight failed:\n${message}`);
  }

  const resolved = preflightResult.tasks;
  registry?.beginBatch(params.sharedContext);
  const totalCount = resolved.length;
  const progressMap = new Map<string, BatchTaskProgress>();
  const conversationViews = new Map<string, AgentConversationView>();

  const publishProgress = (): void => {
    if (!onUpdate) return;
    const tasks = [...progressMap.values()];
    const completedCount = tasks.filter(
      (task) =>
        task.status === "completed" ||
        task.status === "failed" ||
        task.status === "canceled" ||
        task.status === "timeout",
    ).length;
    onUpdate({ tasks, completedCount, totalCount });
  };

  const setProgress = (progress: BatchTaskProgress): void => {
    progressMap.set(progress.taskId, {
      ...progress,
      recentActivity: progress.recentActivity ? [...progress.recentActivity] : undefined,
    });
    publishProgress();
  };

  // Check: ensure profile's required tools are active in the child session.
  const makeReadinessCheck = (
    profile: AgentProfile,
  ): ((session: AgentRunSessionView) => boolean) => {
    return (session: AgentRunSessionView): boolean => {
      const activeNames = session.getActiveToolNames();
      const required = toAgentToolNames(profile.manifest.tools);
      if (required.length === 0) return true;
      return required.every((name) => activeNames.includes(name));
    };
  };

  // Start all runs.
  const handles: Array<{
    taskId: string;
    profileId: string;
    modelId: string;
    thinkingLevel: ResolvedTask["inputs"]["thinkingLevel"];
    handle: AgentRunHandle<string>;
    telemetry: AgentRunTelemetry;
  }> = [];
  for (const task of resolved) {
    const taskMetadata: ConversationTaskMetadata = {
      instructions: task.instructions,
    };
    const modelId = `${task.model.provider}/${task.model.id}`;
    setProgress({
      taskId: task.taskId,
      profileId: task.profileId,
      status: "starting",
      turns: 0,
      toolUses: 0,
      modelId,
      thinkingLevel: task.inputs.thinkingLevel,
    });
    const recentActivity: string[] = [];
    const prompt = buildChildPrompt({
      sharedContext: params.sharedContext,
      instructions: task.instructions,
    });
    let liveSession: AgentRunSessionView | undefined;
    const telemetry = new AgentRunTelemetry();
    const currentConversationView = (
      acceptedSteering: readonly string[] = [],
    ): AgentConversationView =>
      liveSession
        ? buildConversationView({
            taskId: task.taskId,
            profileId: task.profileId,
            messages: liveSession.messages,
            acceptedSteering,
            taskMetadata,
          })
        : (conversationViews.get(task.taskId) ?? {
            taskId: task.taskId,
            profileId: task.profileId,
            entries: [],
            omittedEntryCount: 0,
            omittedCharacterCount: 0,
            textTruncated: false,
            taskMetadata,
          });

    const handle = startAgentRun<string>({
      inputs: task.inputs,
      prompt,
      signal: ctx.signal ?? undefined,
      timeoutMs: task.timeoutMs,
      readinessCheck: makeReadinessCheck(task.profile),
      completionResolver: (session) => session.getLastAssistantText(),
      observer: (session) => {
        liveSession = session;
        registry?.refresh();
        const unsubscribe = session.subscribe((event) => {
          telemetry.observe(event);
          const activity = summarizeToolActivity(event);
          if (activity) {
            recentActivity.push(activity);
            if (recentActivity.length > 5) recentActivity.shift();
            const current = progressMap.get(task.taskId);
            if (current) {
              setProgress({
                ...current,
                recentActivity,
              });
            }
          }
          registry?.refresh();
        });

        // The cleanup runs during finish, before result resolves.
        return () => {
          unsubscribe();
          try {
            const view = currentConversationView(registry?.acceptedSteering(task.taskId));
            conversationViews.set(task.taskId, view);
            registry?.setConversationView(task.taskId, view);
          } catch {
            // Conversation View is presentation-only.
          } finally {
            liveSession = undefined;
          }
        };
      },
    });

    handles.push({
      taskId: task.taskId,
      profileId: task.profileId,
      modelId,
      thinkingLevel: task.inputs.thinkingLevel,
      handle,
      telemetry,
    });
    registry?.register({
      taskId: task.taskId,
      profileId: task.profileId,
      modelId,
      thinkingLevel: task.inputs.thinkingLevel,
      taskMetadata,
      handle,
      getConversationView: currentConversationView,
      getRecentActivity: () => recentActivity,
    });

    handle.subscribe((progress) => {
      if (progress.status === "running") telemetry.markRunning();
      setProgress({
        taskId: task.taskId,
        profileId: task.profileId,
        status: progress.status,
        turns: progress.turns,
        toolUses: progress.toolUses,
        usage: progress.usage,
        recentActivity,
        modelId,
        thinkingLevel: task.inputs.thinkingLevel,
      });
    });
  }

  // Await all; output order matches input.
  const settled = await Promise.allSettled(handles.map((entry) => entry.handle.result));

  const results: BatchTaskResult[] = [];
  const usageList: Usage[] = [];

  for (let index = 0; index < handles.length; index++) {
    const { taskId, profileId, modelId, thinkingLevel, telemetry } = handles[index];
    const outcome = settled[index];

    if (outcome.status === "rejected") {
      results.push({
        taskId,
        profileId,
        status: "failed",
        failureCode: "unexpected-runner-failure",
        turns: 0,
        toolUses: 0,
        humanTruncated: false,
        modelTruncated: false,
        modelId,
        thinkingLevel,
        taskMetadata: resolved[index]?.instructions
          ? {
              instructions: resolved[index].instructions,
            }
          : undefined,
      });
      setProgress({
        taskId,
        profileId,
        status: "failed",
        turns: 0,
        toolUses: 0,
        modelId,
        thinkingLevel,
      });
      continue;
    }

    const agentOutcome = outcome.value;
    const status = statusFromOutcome(agentOutcome);
    const progress = progressMap.get(taskId);
    recordAgentRunOutcomeDebug(
      {
        cwd: ctx.cwd,
        taskId,
        profileId,
        modelId,
        thinkingLevel,
        turns: progress?.turns ?? 0,
        toolUses: progress?.toolUses ?? 0,
        timing: telemetry.snapshot(),
      },
      agentOutcome,
    );
    const usage = agentOutcome.usage;
    if (usage) usageList.push(usage);

    const rawText = agentOutcome.kind === "success" ? agentOutcome.value : "";
    const modelText = capModelText(rawText);
    const humanText = capHumanText(rawText);

    results.push({
      taskId,
      profileId,
      status,
      finalText: modelText,
      finalTextFull: humanText,
      humanTruncated: humanTextOverflow(rawText) > 0,
      modelTruncated: modelTextOverflow(rawText) > 0,
      usage,
      failureCode: failureCodeFromOutcome(agentOutcome),
      turns: progressMap.get(taskId)?.turns ?? 0,
      toolUses: progressMap.get(taskId)?.toolUses ?? 0,
      modelId,
      thinkingLevel,
      taskMetadata: resolved[index]?.instructions
        ? {
            instructions: resolved[index].instructions,
          }
        : undefined,
    });

    setProgress({
      taskId,
      profileId,
      status,
      turns: progressMap.get(taskId)?.turns ?? 0,
      toolUses: progressMap.get(taskId)?.toolUses ?? 0,
      usage,
      modelId,
      thinkingLevel,
    });
  }

  const aggregateUsage = usageList.length > 0 ? combineAgentRunUsage(usageList) : undefined;
  const formatted = formatModelResult(results);

  return {
    modelText: formatted.text,
    fullOutputPath: formatted.fullOutputPath,
    results,
    aggregateUsage,
    conversationViews,
  };
}

// ── Format model-visible result ─────────────────────────────────

function formatModelResult(results: readonly BatchTaskResult[]): {
  text: string;
  fullOutputPath?: string;
} {
  const sections: AggregateSection[] = results.map((task) => {
    const header = `## ${task.taskId} (profile: ${task.profileId}) — ${task.status}`;
    if (task.status === "completed") {
      return { overhead: header, body: task.finalText ?? "(no output)" };
    }
    const reason = task.failureCode ? ` (${task.failureCode})` : "";
    return {
      overhead: `${header}${reason}\nTurns: ${task.turns} · Tool uses: ${task.toolUses}`,
      body: "",
    };
  });
  return boundAggregateOutput(sections);
}
