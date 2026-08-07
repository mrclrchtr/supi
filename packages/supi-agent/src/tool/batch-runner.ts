import type { Usage } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  AgentRunHandle,
  AgentRunOutcome,
  AgentRunSessionView,
  AgentSessionInputs,
} from "@mrclrchtr/supi-agent-runtime/api";
import {
  combineAgentRunUsage,
  createAgentRunProviderAuthority,
  startAgentRun,
} from "@mrclrchtr/supi-agent-runtime/api";
import { isReadOnlyCapabilitySet, toAgentToolNames } from "../capabilities.ts";
import { resolveAgentProfile } from "../model-policy.ts";
import { resolveProfileDefinition } from "../profile-catalogue.ts";
import { resolveAgentDirectory } from "../resources.ts";
import type { AgentModelContext, AgentProfile, ProfileCatalogue } from "../types.ts";
import type { AgentConversationView, ConversationTaskMetadata } from "./conversation-view.ts";
import { buildConversationView } from "./conversation-view.ts";
import { capHumanText, capModelText, humanTextOverflow, modelTextOverflow } from "./output.ts";
import type {
  AgentRunRegistry,
  BatchProgressState,
  BatchTaskProgress,
  BatchTaskResult,
  BatchTaskStatus,
} from "./registry.ts";
import type { AgentRunToolParams } from "./schema.ts";
import { summarizeToolActivity } from "./tool-summary.ts";

// ── Progress ─────────────────────────────────────────────────────

type OnUpdate = (details: BatchProgressState) => void;

// ── Validation ───────────────────────────────────────────────────

interface PreflightError {
  taskId?: string;
  profileId: string;
  message: string;
}

interface ResolvedTask {
  taskId: string;
  profileId: string;
  profile: AgentProfile;
  instructions: string;
  timeoutMs?: number;
  model: AgentSessionInputs["model"];
  inputs: AgentSessionInputs;
}

// ── Mapper helpers ───────────────────────────────────────────────

function failureCodeFromOutcome(outcome: AgentRunOutcome<string>): string | undefined {
  if (outcome.kind === "failed") return outcome.failureCode;
  if (outcome.kind === "canceled" || outcome.kind === "timeout") return outcome.kind;
  return undefined;
}

function batchTaskStatus(outcome: AgentRunOutcome<string>): BatchTaskStatus {
  switch (outcome.kind) {
    case "success":
      return "completed";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    case "timeout":
      return "timeout";
  }
}

// ── Build child prompt ──────────────────────────────────────────

function buildChildPrompt(input: { sharedContext?: string; instructions: string }): string {
  if (!input.sharedContext?.trim()) return input.instructions;
  return `${input.sharedContext.trim()}\n\n${input.instructions}`;
}

// ── Preflight ────────────────────────────────────────────────────

function buildModelContext(ctx: ExtensionContext): AgentModelContext {
  return {
    providerAuthority: createAgentRunProviderAuthority(ctx.modelRegistry),
    currentModel: ctx.model,
    currentThinkingLevel: ctx.thinkingLevel,
    scopedModels: ctx.scopedModels.map((entry) => ({
      model: entry.model,
      thinkingLevel: entry.thinkingLevel,
    })),
    modelRegistry: ctx.modelRegistry,
  };
}

function preflight(
  params: AgentRunToolParams,
  catalogue: ProfileCatalogue,
  ctx: ExtensionContext,
): { tasks: ResolvedTask[] } | { errors: PreflightError[] } {
  const errors: PreflightError[] = [];
  const ids = new Set<string>();

  for (const task of params.tasks) {
    if (ids.has(task.id)) {
      errors.push({
        taskId: task.id,
        profileId: task.profile,
        message: `Duplicate task ID "${task.id}".`,
      });
    }
    ids.add(task.id);
  }

  if (errors.length > 0) return { errors };

  const resolved: ResolvedTask[] = [];
  const modelContext = buildModelContext(ctx);
  const agentDir = resolveAgentDirectory();

  for (const task of params.tasks) {
    const profileEntry = catalogue.profiles.find((profile) => profile.id === task.profile);
    if (!profileEntry) {
      errors.push({
        taskId: task.id,
        profileId: task.profile,
        message: `Unknown profile "${task.profile}".`,
      });
      continue;
    }
    const profile = resolveProfileDefinition(profileEntry);
    if ("code" in profile) {
      errors.push({ taskId: task.id, profileId: task.profile, message: profile.message });
      continue;
    }
    const resolvedProfile = resolveAgentProfile(profile, modelContext, {
      cwd: ctx.cwd,
      agentDir,
      projectTrusted: ctx.isProjectTrusted(),
      providerAuthority: modelContext.providerAuthority,
    });
    if ("code" in resolvedProfile) {
      errors.push({ taskId: task.id, profileId: task.profile, message: resolvedProfile.message });
      continue;
    }
    resolved.push({
      taskId: task.id,
      profileId: task.profile,
      profile,
      instructions: task.instructions,
      timeoutMs: resolvedProfile.timeoutMs,
      model: resolvedProfile.model,
      inputs: resolvedProfile.inputs,
    });
  }

  // Mutation-capable profiles require single-task batch.
  const anyMutation = resolved.some(
    (task) => !isReadOnlyCapabilitySet(task.profile.manifest.tools),
  );
  if (anyMutation && params.tasks.length > 1) {
    errors.push({
      profileId: "(batch)",
      message:
        "Mutation-capable profiles require a single-task batch. Reduce to one task or use only read-only profiles.",
    });
  }

  if (errors.length > 0) return { errors };
  return { tasks: resolved };
}

// ── Execute batch ────────────────────────────────────────────────

/**
 * Preflight a Delegation Batch atomically, execute every Agent Run, and return ordered results
 * with aggregate usage. The caller owns the registry for active-run tracking and shutdown.
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: batch execution stays in one audited function.
// biome-ignore lint/complexity/useMaxParams: batch orchestration needs catalogue, context, registry.
export async function runDelegationBatch(
  params: AgentRunToolParams,
  catalogue: ProfileCatalogue,
  ctx: ExtensionContext,
  onUpdate?: OnUpdate,
  registry?: AgentRunRegistry,
): Promise<{
  modelText: string;
  results: BatchTaskResult[];
  aggregateUsage?: Usage;
  conversationViews: Map<string, AgentConversationView>;
}> {
  const preflightResult = preflight(params, catalogue, ctx);
  if ("errors" in preflightResult) {
    const message = preflightResult.errors
      .map((err) => `${err.taskId ? `${err.taskId}: ` : ""}${err.message}`)
      .join("\n");
    throw new Error(`Delegation Batch preflight failed:\n${message}`);
  }

  const resolved = preflightResult.tasks;
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
  const handles: Array<{ taskId: string; profileId: string; handle: AgentRunHandle<string> }> = [];
  for (const task of resolved) {
    const taskMetadata: ConversationTaskMetadata = {
      instructions: task.instructions,
      sharedContext: params.sharedContext,
    };
    setProgress({
      taskId: task.taskId,
      profileId: task.profileId,
      status: "starting",
      turns: 0,
      toolUses: 0,
    });
    const recentActivity: string[] = [];
    const prompt = buildChildPrompt({
      sharedContext: params.sharedContext,
      instructions: task.instructions,
    });

    const handle = startAgentRun<string>({
      inputs: task.inputs,
      prompt,
      signal: ctx.signal ?? undefined,
      timeoutMs: task.timeoutMs,
      readinessCheck: makeReadinessCheck(task.profile),
      completionResolver: (session) => session.getLastAssistantText() ?? "",
      observer: (session) => {
        const unsubscribe = session.subscribe((event) => {
          const activity = summarizeToolActivity(event);
          if (!activity) return;
          recentActivity.push(activity);
          if (recentActivity.length > 5) recentActivity.shift();
          const current = progressMap.get(task.taskId);
          if (!current) return;
          setProgress({
            taskId: task.taskId,
            profileId: task.profileId,
            status: current.status,
            turns: current.turns,
            toolUses: current.toolUses,
            usage: current.usage,
            recentActivity,
          });
        });

        // The cleanup runs during finish, before result resolves.
        return () => {
          unsubscribe();
          try {
            const messages = session.messages;
            const view = buildConversationView({
              taskId: task.taskId,
              profileId: task.profileId,
              messages,
              taskMetadata,
            });
            conversationViews.set(task.taskId, view);
            registry?.setConversationView(task.taskId, view);
          } catch {
            // Conversation View is presentation-only.
          }
        };
      },
    });

    handles.push({ taskId: task.taskId, profileId: task.profileId, handle });
    registry?.register(task.taskId, handle);

    handle.subscribe((progress) => {
      setProgress({
        taskId: task.taskId,
        profileId: task.profileId,
        status: progress.status,
        turns: progress.turns,
        toolUses: progress.toolUses,
        usage: progress.usage,
        recentActivity,
      });
    });
  }

  // Await all; output order matches input.
  const settled = await Promise.allSettled(handles.map((entry) => entry.handle.result));

  const results: BatchTaskResult[] = [];
  const usageList: Usage[] = [];

  for (let index = 0; index < handles.length; index++) {
    const { taskId, profileId } = handles[index];
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
      });
      setProgress({ taskId, profileId, status: "failed", turns: 0, toolUses: 0 });
      continue;
    }

    const agentOutcome = outcome.value;
    const status = batchTaskStatus(agentOutcome);
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
    });

    setProgress({
      taskId,
      profileId,
      status,
      turns: progressMap.get(taskId)?.turns ?? 0,
      toolUses: progressMap.get(taskId)?.toolUses ?? 0,
      usage,
    });
  }

  const aggregateUsage = usageList.length > 0 ? combineAgentRunUsage(usageList) : undefined;
  const modelText = formatModelResult(results);

  return { modelText, results, aggregateUsage, conversationViews };
}

// ── Format model-visible result ─────────────────────────────────

function formatModelResult(results: readonly BatchTaskResult[]): string {
  const sections = results.map((task) => {
    const header = `## ${task.taskId} (profile: ${task.profileId}) — ${task.status}`;
    if (task.status === "completed") {
      return `${header}\n${task.finalText ?? "(no output)"}`;
    }
    const reason = task.failureCode ? ` (${task.failureCode})` : "";
    return `${header}${reason}\nTurns: ${task.turns} · Tool uses: ${task.toolUses}`;
  });
  return sections.join("\n\n");
}
