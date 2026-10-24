import type {
  AgentRunDisplayConversation,
  AgentRunOutcome,
  AgentRunRegistry,
  AgentRunSessionView,
  RegisteredAgentRunHandle,
} from "@mrclrchtr/supi-agent-runtime/api";
import {
  getAgentRunDiagnosticErrorRows,
  startRegisteredAgentRun,
} from "@mrclrchtr/supi-agent-runtime/api";
import { toAgentToolNames } from "../../capabilities.ts";
import { createDelegationCheckpoint } from "../../delegation/checkpoints.ts";
import type { AgentProfile } from "../../types.ts";
import type { ResolvedTask } from "./batch-preflight.ts";
import type { BatchTaskProgress, BatchTaskResult } from "./batch-types.ts";
import type { AgentConversationView, ConversationTaskMetadata } from "./conversation-view.ts";
import { buildConversationView } from "./conversation-view.ts";
import { buildChildPrompt } from "./prompt.ts";
import {
  AgentRunTelemetry,
  createTaskDebugRetrospective,
  failureCodeFromOutcome,
  recordAgentRunOutcomeDebug,
  statusFromOutcome,
} from "./run-telemetry.ts";
import type { AgentRunToolParams } from "./schema.ts";
import { capHumanText, capModelText, humanTextOverflow, modelTextOverflow } from "./text-caps.ts";
import { summarizeToolActivity } from "./tool-summary.ts";

/** One started child run and its finalized result. */
export interface StartedBatchTask {
  readonly taskId: string;
  readonly runKey: string;
  readonly handle: RegisteredAgentRunHandle<string>;
  readonly completion: Promise<BatchTaskResult>;
}

/** Inputs for one child run inside a Delegation Batch. */
export interface StartBatchTaskOptions {
  readonly params: AgentRunToolParams;
  readonly task: ResolvedTask;
  readonly batchId: string;
  readonly runKey: string;
  readonly cwd: string;
  readonly signal?: AbortSignal;
  readonly registry?: AgentRunRegistry;
  readonly conversationViews: Map<string, AgentConversationView>;
  readonly onProgress: (progress: BatchTaskProgress) => void;
}

interface FinalizeContext {
  readonly task: ResolvedTask;
  readonly taskMetadata: ConversationTaskMetadata;
  readonly modelId: string;
  readonly cwd: string;
  readonly runKey: string;
  readonly registry?: AgentRunRegistry;
  readonly telemetry: AgentRunTelemetry;
  readonly currentProgress: () => BatchTaskProgress | undefined;
  readonly publishProgress: (progress: BatchTaskProgress) => void;
}

interface ObserverContext {
  readonly conversation: TaskConversation;
  readonly telemetry: AgentRunTelemetry;
  readonly registry?: AgentRunRegistry;
  readonly recentActivity: string[];
  readonly currentProgress: () => BatchTaskProgress | undefined;
  readonly publishProgress: (progress: BatchTaskProgress) => void;
}

/** Read current and saved conversation views for one task. */
class TaskConversation {
  #liveSession: AgentRunSessionView | undefined;

  constructor(
    private readonly task: ResolvedTask,
    private readonly taskMetadata: ConversationTaskMetadata,
    readonly runKey: string,
    private readonly views: Map<string, AgentConversationView>,
  ) {}

  bind(session: AgentRunSessionView): void {
    this.#liveSession = session;
  }

  unbind(): void {
    this.#liveSession = undefined;
  }

  save(view: AgentConversationView): void {
    this.views.set(this.task.taskId, view);
  }

  current(queuedSteering: readonly string[] = []): AgentConversationView {
    if (this.#liveSession) {
      return buildConversationView({
        taskId: this.task.taskId,
        profileId: this.task.profileId,
        messages: this.#liveSession.messages,
        queuedSteering,
        taskMetadata: this.taskMetadata,
      });
    }
    return (
      this.views.get(this.task.taskId) ??
      buildConversationView({
        taskId: this.task.taskId,
        profileId: this.task.profileId,
        messages: [],
        taskMetadata: this.taskMetadata,
      })
    );
  }

  display(queuedSteering: readonly string[]): AgentRunDisplayConversation {
    const view = this.current(queuedSteering);
    return {
      entries: view.entries,
      omittedEntryCount: view.omittedEntryCount,
      omittedCharacterCount: view.omittedCharacterCount,
      textTruncated: view.textTruncated,
    };
  }
}

/** Start one child run and finalize its result as soon as the run settles. */
export function startBatchTask(options: StartBatchTaskOptions): StartedBatchTask {
  const { batchId, params, registry, runKey, task } = options;
  const taskMetadata: ConversationTaskMetadata = { instructions: task.instructions };
  const modelId = `${task.model.provider}/${task.model.id}`;
  const thinkingLevel = task.inputs.thinkingLevel;
  const recentActivity: string[] = [];
  const telemetry = new AgentRunTelemetry();
  const conversation = new TaskConversation(task, taskMetadata, runKey, options.conversationViews);
  let latestProgress: BatchTaskProgress | undefined;

  const publishProgress = (progress: BatchTaskProgress): void => {
    latestProgress = progress;
    try {
      options.onProgress(progress);
    } catch {
      // Progress is presentation-only and cannot change batch execution.
    }
  };

  const observer = makeObserver({
    conversation,
    telemetry,
    ...(registry ? { registry } : {}),
    recentActivity,
    currentProgress: () => latestProgress,
    publishProgress,
  });

  const handle = startRegisteredAgentRun<string>({
    inputs: task.inputs,
    prompt: buildChildPrompt(task, params.sharedContext),
    captureContext: true,
    retrospective: registry ? createTaskDebugRetrospective(options) : undefined,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(task.timeoutMs === undefined ? {} : { timeoutMs: task.timeoutMs }),
    readinessCheck: makeReadinessCheck(task.profile),
    completionResolver: (session) => session.getLastAssistantText(),
    observer,
    ...(registry ? { registry } : {}),
    registration: {
      metadata: {
        runKey,
        batchId,
        taskId: task.taskId,
        kind: "Agent Run",
        label: task.profileId,
        cwd: task.inputs.cwd,
        modelId,
        thinkingLevel,
        tools: task.inputs.tools,
        taskDescription: task.instructions,
        ...(params.sharedContext === undefined ? {} : { sharedContext: params.sharedContext }),
        startedAt: Date.now(),
      },
      getConversation: (queuedSteering) => conversation.display(queuedSteering),
      getRecentActivity: () => recentActivity,
    },
  });

  const finalizeContext: FinalizeContext = {
    task,
    taskMetadata,
    modelId,
    cwd: options.cwd,
    runKey,
    ...(registry ? { registry } : {}),
    telemetry,
    currentProgress: () => latestProgress,
    publishProgress,
  };
  let taskFinished = false;
  const completion = handle.taskResult.then(
    (outcome) => {
      taskFinished = true;
      return finalizeTaskOutcome(finalizeContext, outcome);
    },
    () => {
      taskFinished = true;
      return finalizeRejectedTask(finalizeContext);
    },
  );

  try {
    handle.subscribe((progress) => {
      if (taskFinished || progress.status === "retrospecting") return;
      if (progress.status === "running") telemetry.markRunning();
      publishProgress({
        taskId: task.taskId,
        profileId: task.profileId,
        conversationId: task.conversationId,
        conversationLabel: task.conversationLabel,
        status: progress.status,
        turns: progress.turns,
        toolUses: progress.toolUses,
        usage: progress.usage,
        recentActivity: [...recentActivity],
        modelId,
        thinkingLevel,
      });
    });
  } catch (error) {
    void handle.stop().catch(() => undefined);
    void completion.catch(() => undefined);
    throw error;
  }

  return { taskId: task.taskId, runKey, handle, completion };
}

function makeObserver(context: ObserverContext): (session: AgentRunSessionView) => () => void {
  return (session) => {
    context.conversation.bind(session);
    context.registry?.refresh();
    const unsubscribe = session.subscribe((event) => {
      context.telemetry.observe(event);
      const activity = summarizeToolActivity(event);
      if (activity) {
        context.recentActivity.push(activity);
        if (context.recentActivity.length > 5) context.recentActivity.shift();
        const current = context.currentProgress();
        if (current) {
          context.publishProgress({
            ...current,
            recentActivity: [...context.recentActivity],
          });
        }
      }
      context.registry?.refresh();
    });

    // Cleanup runs during finish, before the result resolves.
    return () => {
      unsubscribe();
      try {
        const view = context.conversation.current(
          context.registry?.queuedSteering(context.conversation.runKey),
        );
        context.conversation.save(view);
      } catch {
        // Conversation View is presentation-only.
      } finally {
        context.conversation.unbind();
      }
    };
  };
}

function finalizeTaskOutcome(
  context: FinalizeContext,
  outcome: AgentRunOutcome<string>,
): BatchTaskResult {
  const progress = context.currentProgress();
  const status = statusFromOutcome(outcome);
  const failureCode = failureCodeFromOutcome(outcome);
  recordAgentRunOutcomeDebug(
    {
      cwd: context.cwd,
      taskId: context.task.taskId,
      profileId: context.task.profileId,
      modelId: context.modelId,
      thinkingLevel: context.task.inputs.thinkingLevel,
      turns: progress?.turns ?? 0,
      toolUses: progress?.toolUses ?? 0,
      timing: context.telemetry.snapshot(),
    },
    outcome,
  );

  const usage = outcome.usage;
  const rawText = outcome.kind === "success" ? outcome.value : "";
  const checkpoint = createDelegationCheckpoint({
    context: outcome.context,
    baseContext: context.task.baseContext,
    conversationId: context.task.conversationId,
    label: context.task.conversationLabel,
    profileId: context.task.profileId,
    parentCheckpointId: context.task.parentCheckpointId,
    runStatus: outcome.kind === "success" ? "completed" : outcome.kind,
    ...(failureCode ? { failureCode } : {}),
  });
  const modelText = capModelText(rawText);
  const humanText = capHumanText(rawText);
  const humanTruncated = humanTextOverflow(rawText) > 0;
  const modelTruncated = modelTextOverflow(rawText) > 0;
  const result: BatchTaskResult = {
    taskId: context.task.taskId,
    profileId: context.task.profileId,
    conversationId: context.task.conversationId,
    conversationLabel: context.task.conversationLabel,
    ...(checkpoint ? { checkpoint } : {}),
    status,
    finalText: modelText,
    finalTextFull: humanText,
    humanTruncated,
    modelTruncated,
    usage,
    failureCode,
    failureSummary:
      outcome.kind === "failed" && outcome.failureCode !== "session-creation-failed"
        ? getAgentRunDiagnosticErrorRows(outcome.diagnostics)
            .map((row) => row.text)
            .join("; ") || undefined
        : undefined,
    turns: progress?.turns ?? 0,
    toolUses: progress?.toolUses ?? 0,
    modelId: context.modelId,
    thinkingLevel: context.task.inputs.thinkingLevel,
    taskMetadata: context.taskMetadata,
  };
  context.registry?.setDisplayResult(context.runKey, {
    finalText: humanText,
    failureCode,
    humanTruncated,
    modelTruncated,
  });
  context.publishProgress({
    taskId: context.task.taskId,
    profileId: context.task.profileId,
    conversationId: context.task.conversationId,
    conversationLabel: context.task.conversationLabel,
    status,
    turns: result.turns,
    toolUses: result.toolUses,
    usage,
    modelId: context.modelId,
    thinkingLevel: context.task.inputs.thinkingLevel,
  });
  return result;
}

function finalizeRejectedTask(context: FinalizeContext): BatchTaskResult {
  const result: BatchTaskResult = {
    taskId: context.task.taskId,
    profileId: context.task.profileId,
    conversationId: context.task.conversationId,
    conversationLabel: context.task.conversationLabel,
    status: "failed",
    failureCode: "unexpected-runner-failure",
    turns: 0,
    toolUses: 0,
    humanTruncated: false,
    modelTruncated: false,
    modelId: context.modelId,
    thinkingLevel: context.task.inputs.thinkingLevel,
    taskMetadata: context.task.instructions
      ? { instructions: context.task.instructions }
      : undefined,
  };
  context.publishProgress({
    taskId: context.task.taskId,
    profileId: context.task.profileId,
    conversationId: context.task.conversationId,
    conversationLabel: context.task.conversationLabel,
    status: "failed",
    turns: 0,
    toolUses: 0,
    modelId: context.modelId,
    thinkingLevel: context.task.inputs.thinkingLevel,
  });
  context.registry?.setDisplayResult(context.runKey, {
    failureCode: "unexpected-runner-failure",
  });
  return result;
}

function makeReadinessCheck(profile: AgentProfile): (session: AgentRunSessionView) => boolean {
  const required = toAgentToolNames(profile.manifest.tools);
  return (session) => required.every((name) => session.getActiveToolNames().includes(name));
}
