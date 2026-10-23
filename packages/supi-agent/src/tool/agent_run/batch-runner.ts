import { randomUUID } from "node:crypto";
import type { Usage } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgentRunRegistry } from "@mrclrchtr/supi-agent-runtime/api";
import {
  type AgentRunAuxiliaryModelSnapshot,
  captureAgentRunAuxiliaryModels,
  combineAgentRunUsage,
  raceAgentRunStartup,
} from "@mrclrchtr/supi-agent-runtime/api";
import type { ProfileCatalogue } from "../../types.ts";
import type { ResolvedTask } from "./batch-preflight.ts";
import { preflightDelegationBatch } from "./batch-preflight.ts";
import type {
  BatchProgressState,
  BatchTaskProgress,
  BatchTaskResult,
  DelegationBatchHandle,
  DelegationBatchOutcome,
  StartDelegationBatchOptions,
} from "./batch-types.ts";
import type { AgentConversationView } from "./conversation-view.ts";
import type { AgentRunToolParams } from "./schema.ts";
import type { StartedBatchTask } from "./task-runner.ts";
import { startBatchTask } from "./task-runner.ts";

// ── Progress helpers ─────────────────────────────────────────────

type OnUpdate = (details: BatchProgressState) => void;

function isTerminalStatus(status: BatchTaskProgress["status"]): boolean {
  return (
    status === "completed" || status === "failed" || status === "canceled" || status === "timeout"
  );
}

function initialProgress(task: ResolvedTask): BatchTaskProgress {
  return {
    taskId: task.taskId,
    profileId: task.profileId,
    conversationId: task.conversationId,
    conversationLabel: task.conversationLabel,
    status: "starting",
    turns: 0,
    toolUses: 0,
    modelId: `${task.model.provider}/${task.model.id}`,
    thinkingLevel: task.inputs.thinkingLevel,
  };
}

function copyProgress(progress: BatchTaskProgress): BatchTaskProgress {
  return {
    ...progress,
    recentActivity: progress.recentActivity ? [...progress.recentActivity] : undefined,
  };
}

function applyAuxiliaryModelSnapshot(
  task: ResolvedTask,
  snapshot: AgentRunAuxiliaryModelSnapshot | undefined,
): ResolvedTask {
  const { authorizedAuxiliaryModels: previousSnapshot, ...inputs } = task.inputs;
  void previousSnapshot;
  return task.profile.manifest.tools.includes("codemode") && snapshot
    ? { ...task, inputs: { ...inputs, authorizedAuxiliaryModels: snapshot } }
    : { ...task, inputs };
}

// ── Compatibility foreground interface ───────────────────────────

/**
 * Preflight a Delegation Batch atomically, execute every Agent Run, and return ordered results
 * with aggregate usage. This awaited interface remains for foreground runs and current callers.
 */
// biome-ignore lint/complexity/useMaxParams: compatibility signature keeps five parameters.
export async function runDelegationBatch(
  params: AgentRunToolParams,
  catalogue: ProfileCatalogue,
  ctx: ExtensionContext,
  onUpdate?: OnUpdate,
  registry?: AgentRunRegistry,
): Promise<DelegationBatchOutcome> {
  const preflightResult = preflightDelegationBatch(params, catalogue, ctx);
  if ("errors" in preflightResult) {
    const message = preflightResult.errors
      .map((err) => `${err.taskId ? `${err.taskId}: ` : ""}${err.message}`)
      .join("\n");
    throw new Error(`Delegation Batch preflight failed:\n${message}`);
  }

  // Capture plain data before asynchronous child work. Do not retain the ExtensionContext.
  const cwd = ctx.cwd;
  const signal = ctx.signal ?? undefined;
  const startup = startDelegationBatchWithAuxiliaryModels(
    {
      params,
      tasks: preflightResult.tasks,
      cwd,
      ...(signal ? { signal } : {}),
      ...(registry ? { registry } : {}),
      ...(onUpdate ? { onUpdate } : {}),
    },
    () => !signal?.aborted,
  );
  return (await startup.result).result;
}

// ── Background-capable batch runner ──────────────────────────────

/**
 * Capture auxiliary model authority once when at least one task opted in. The caller refreshes this
 * for every top-level batch, including follow-ups; non-opted-in batches do not query the catalogue.
 */
function captureDelegationBatchAuxiliaryModels(
  tasks: readonly ResolvedTask[],
): Promise<AgentRunAuxiliaryModelSnapshot | undefined> {
  const optedInTask = tasks.find((task) => task.profile.manifest.tools.includes("codemode"));
  return optedInTask
    ? captureAgentRunAuxiliaryModels(optedInTask.inputs.providerAuthority)
    : Promise.resolve(undefined);
}

/**
 * Capture auxiliary authority once, then start only while the caller's invocation fence remains
 * open. Discovery itself is uncancelable; `settled` lets the owning controller await it on shutdown.
 */
export function startDelegationBatchWithAuxiliaryModels(
  options: Omit<StartDelegationBatchOptions, "authorizedAuxiliaryModels">,
  canStart: () => boolean,
  signal: AbortSignal | undefined = options.signal,
): {
  result: Promise<DelegationBatchHandle>;
  settled: Promise<void>;
} {
  const discovery = captureDelegationBatchAuxiliaryModels(options.tasks);
  const raced = raceAgentRunStartup(discovery, signal);
  const result = raced.result.then((authorizedAuxiliaryModels) => {
    if (!canStart()) throw new Error("Delegation start canceled.");
    return startDelegationBatch({
      ...options,
      ...(authorizedAuxiliaryModels ? { authorizedAuxiliaryModels } : {}),
    });
  });
  const settled = Promise.allSettled([raced.settled, result]).then(() => undefined);
  return { result, settled };
}

/**
 * Start a validated Delegation Batch without waiting for child setup or results.
 *
 * The caller must run preflight and reserve capacity first. This function does not preflight
 * again and does not own parent-abort, branch, notice, capacity, or Usage-receipt policy.
 */
export function startDelegationBatch(options: StartDelegationBatchOptions): DelegationBatchHandle {
  const { params, tasks, registry, onUpdate, onTaskResult } = options;
  const batchId = randomUUID();
  const runKeys = new Map<string, string>();
  const progressMap = new Map<string, BatchTaskProgress>();
  const conversationViews = new Map<string, AgentConversationView>();
  const results: Array<BatchTaskResult | undefined> = Array(tasks.length).fill(undefined);
  const startedTasks: StartedBatchTask[] = [];
  const completions: Array<Promise<BatchTaskResult>> = [];
  let startFailed = false;
  let stopPromise: Promise<void> | undefined;

  for (const task of tasks) {
    runKeys.set(task.taskId, randomUUID());
    progressMap.set(task.taskId, initialProgress(task));
  }

  const progressSnapshot = (): BatchProgressState => {
    const progressTasks = tasks.map((task) => {
      const progress = progressMap.get(task.taskId);
      return progress ? copyProgress(progress) : initialProgress(task);
    });
    return {
      tasks: progressTasks,
      completedCount: progressTasks.filter((task) => isTerminalStatus(task.status)).length,
      totalCount: tasks.length,
    };
  };

  const publishUpdate = (): void => {
    if (!onUpdate) return;
    try {
      onUpdate(progressSnapshot());
    } catch {
      // Progress is presentation-only and cannot change batch execution.
    }
  };

  const setProgress = (progress: BatchTaskProgress): void => {
    progressMap.set(progress.taskId, copyProgress(progress));
    publishUpdate();
  };

  const buildOutcome = (): DelegationBatchOutcome => {
    const completed = results.filter((result): result is BatchTaskResult => result !== undefined);
    const usages: Usage[] = [];
    for (const result of completed) {
      if (result.usage) usages.push(result.usage);
    }
    return {
      results: [...completed],
      aggregateUsage: usages.length > 0 ? combineAgentRunUsage(usages) : undefined,
      conversationViews: new Map(conversationViews),
      batchId,
      runKeys: new Map(runKeys),
    };
  };

  publishUpdate();
  try {
    for (let index = 0; index < tasks.length; index++) {
      const task = tasks[index];
      const runKey = runKeys.get(task.taskId);
      if (!runKey) throw new Error(`Missing run key for task "${task.taskId}".`);
      const taskWithAuxiliaryModels = applyAuxiliaryModelSnapshot(
        task,
        options.authorizedAuxiliaryModels,
      );
      const started = startBatchTask({
        params,
        task: taskWithAuxiliaryModels,
        batchId,
        runKey,
        cwd: options.cwd,
        ...(options.signal ? { signal: options.signal } : {}),
        ...(registry ? { registry } : {}),
        conversationViews,
        onProgress: setProgress,
      });
      startedTasks.push(started);
      completions.push(
        started.completion.then((result) => {
          results[index] = result;
          if (!startFailed) {
            try {
              onTaskResult?.(result, batchId);
            } catch {
              // Result observers cannot change batch execution.
            }
          }
          return result;
        }),
      );
    }
  } catch (error) {
    startFailed = true;
    for (const completion of completions) void completion.catch(() => undefined);
    void requestStops(startedTasks);
    throw error;
  }

  const result = Promise.allSettled(completions).then(() => buildOutcome());
  const stop = (): Promise<void> => {
    if (stopPromise !== undefined) return stopPromise;
    const activeTasks = startedTasks.filter((started) => {
      const status = progressMap.get(started.taskId)?.status;
      return status === undefined || !isTerminalStatus(status);
    });
    stopPromise = requestStops(activeTasks);
    return stopPromise;
  };

  return {
    batchId,
    runKeys,
    result,
    snapshot: buildOutcome,
    progress: progressSnapshot,
    stop,
  };
}

function requestStops(tasks: readonly StartedBatchTask[]): Promise<void> {
  const stops = tasks.map((task) => {
    try {
      // Each stop closes admission synchronously before it awaits disposal.
      return task.handle.stop();
    } catch {
      return Promise.resolve();
    }
  });
  return Promise.allSettled(stops).then(() => undefined);
}
