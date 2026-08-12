// biome-ignore lint/style/noExcessiveLinesPerFile: the Agent Run state machine keeps lifecycle ownership auditable in one closure.
import type { Api, Model, Usage } from "@earendil-works/pi-ai";
import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionRuntime,
  ExtensionRuntime,
} from "@earendil-works/pi-coding-agent";
import {
  createAgentSession,
  createAgentSessionRuntime,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { buildAgentRunDiagnostics } from "./diagnostics.ts";
import { AgentRunLifecycleTraceCollector, getRegisteredToolNames } from "./lifecycle-trace.ts";
import { createAgentRunModelRuntime } from "./provider-authority.ts";
import { createAgentRunSessionView, deactivateAgentRunSessionView } from "./session-view.ts";
import type {
  AgentRunContinuationEvent,
  AgentRunContinuationFailureCode,
  AgentRunContinuationStep,
  AgentRunContinuationTurn,
  AgentRunFailureCode,
  AgentRunHandle,
  AgentRunOutcome,
  AgentRunProgress,
  AgentRunProgressListener,
  AgentRunSessionView,
  AgentRunStatus,
  AgentRunSteerResult,
  StartAgentRunOptions,
} from "./types.ts";
import { collectAgentRunUsage } from "./usage.ts";

/** Grace period for a provider abort before disposal continues. */
export const AGENT_RUN_ABORT_GRACE_MS = 2_000;
/** Grace period for AgentSessionRuntime disposal. */
export const AGENT_RUN_SHUTDOWN_GRACE_MS = 2_000;
/** Maximum turns accepted from one finite continuation policy. */
export const AGENT_RUN_MAX_CONTINUATION_TURNS = 8;

/** Start one foreground Agent Run and return its control handle immediately. */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: lifecycle state and teardown stay in one audited closure.
export function startAgentRun<T>(options: StartAgentRunOptions<T>): AgentRunHandle<T> {
  const listeners = new Set<AgentRunProgressListener>();
  const progressState: {
    status: AgentRunStatus;
    turns: number;
    toolUses: number;
    toolErrors: number;
    usage?: Usage;
  } = {
    status: "starting",
    turns: 0,
    toolUses: 0,
    toolErrors: 0,
  };
  let lifecycle = new AgentRunLifecycleTraceCollector();
  let runtime: AgentSessionRuntime | undefined;
  let session: AgentSession | undefined;
  let view: AgentRunSessionView | undefined;
  let unsubscribe: (() => void) | undefined;
  let observerCleanup: (() => void) | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let promptStarted = false;
  let promptActive = false;
  let promptPreflightSettled = false;
  let promptAccepted = false;
  let promptPreflightCompletion: Promise<void> | undefined;
  let promptPromiseSettled = false;
  let promptFailureCode: "prompt-rejected" | "unexpected-runner-failure" | undefined;
  let settledEventObserved = false;
  let promptSettlement: Promise<void> | undefined;
  let continuationTurn = 0;
  let continuationInitialFailure: AgentRunContinuationFailureCode | undefined;
  let previousContinuationTurn: AgentRunContinuationTurn | undefined;
  let cancelRequested = false;
  let timeoutRequested = false;
  let cancellationMarkerRecorded = false;
  let resolvingCompletion = false;
  let completionResolution: Promise<void> | undefined;
  let aborting = false;
  let sessionSetupFinished = false;
  let extensionsBound = false;
  let finalizing = false;
  let terminal = false;
  let finalization: Promise<void> | undefined;
  let abortPromise: Promise<void> | undefined;
  let abortCompletion: Promise<void> | undefined;
  let stopRequest: Promise<void> | undefined;
  let extensionRuntime: ExtensionRuntime | undefined;
  let selectAuthorizedModel: ((model: Model<Api>) => boolean) | undefined;
  let extensionAdmissionOpen = true;
  let admissionGeneration = 0;
  let fencedSession: AgentSession | undefined;
  const extensionWork = new Set<Promise<unknown>>();
  let resolveSessionSetupFinished!: () => void;
  const sessionSetupDone = new Promise<void>((resolve) => {
    resolveSessionSetupFinished = resolve;
  });
  let resolveSetupCallbacksFinished!: () => void;
  const setupCallbacksDone = new Promise<void>((resolve) => {
    resolveSetupCallbacksFinished = resolve;
  });
  const markSessionSetupFinished = (): void => {
    if (sessionSetupFinished) return;
    sessionSetupFinished = true;
    resolveSessionSetupFinished();
  };
  let resolveResult!: (outcome: AgentRunOutcome<T>) => void;
  const result = new Promise<AgentRunOutcome<T>>((resolve) => {
    resolveResult = resolve;
  });

  const snapshot = (): AgentRunProgress => {
    const usage = progressState.usage;
    const copiedUsage = usage ? cloneUsage(usage) : undefined;
    const next: AgentRunProgress = {
      status: progressState.status,
      turns: progressState.turns,
      toolUses: progressState.toolUses,
      toolErrors: progressState.toolErrors,
      ...(copiedUsage ? { usage: copiedUsage } : {}),
    };
    return freezeProgress(next);
  };

  const publish = (): void => {
    const current = snapshot();
    for (const listener of listeners) {
      try {
        listener(current);
      } catch {
        // Progress is presentation-only and cannot change lifecycle semantics.
      }
    }
  };

  const setStatus = (status: AgentRunStatus): void => {
    if (terminal) return;
    progressState.status = status;
    publish();
  };

  const refreshUsage = (): Usage | undefined => {
    if (!session) return progressState.usage;
    const usage = collectAgentRunUsage(session);
    if (usage) progressState.usage = usage;
    return progressState.usage;
  };

  const observeContinuation = (event: AgentRunContinuationEvent): void => {
    try {
      options.continuation?.onEvent?.(event);
    } catch {
      // Continuation evidence cannot change lifecycle semantics.
    }
  };

  const observeContinuationTurn = (turn: AgentRunContinuationTurn): void => {
    previousContinuationTurn = turn;
    try {
      options.continuation?.onTurn?.(turn);
    } catch {
      // Continuation evidence cannot change lifecycle semantics.
    }
  };

  const diagnostics = () =>
    buildAgentRunDiagnostics({
      progress: progressState,
      session,
      lifecycleTrace: lifecycle.snapshot(),
      recentActivity: lifecycle.recentActivitySnapshot(),
    });

  const outcomeWithUsage = <TOutcome extends AgentRunOutcome<T>>(outcome: TOutcome): TOutcome => {
    const usage = refreshUsage();
    return usage ? ({ ...outcome, usage } as TOutcome) : outcome;
  };

  const trackExtensionWork = (start: () => Promise<unknown>): void => {
    let resolveWork!: () => void;
    let rejectWork!: (error: unknown) => void;
    const work = new Promise<void>((resolve, reject) => {
      resolveWork = resolve;
      rejectWork = reject;
    });
    extensionWork.add(work);
    void work.then(
      () => extensionWork.delete(work),
      () => extensionWork.delete(work),
    );
    try {
      Promise.resolve(start()).then(resolveWork, rejectWork);
    } catch (error) {
      rejectWork(error);
      throw error;
    }
  };

  const closeSessionAdmission = (): void => {
    extensionAdmissionOpen = false;
    const activeSession = session;
    if (!activeSession || activeSession === fencedSession) return;
    fencedSession = activeSession;
    admissionGeneration++;
    try {
      activeSession.clearQueue();
    } catch {
      // Queue clearing is best effort before disposal.
    }
  };

  const beginAbort = (): void => {
    if (abortPromise || !session) return;
    try {
      // AgentSession.abort() calls the synchronous lower-level abort before its first await.
      abortPromise = Promise.resolve(session.abort()).catch(() => undefined);
    } catch {
      abortPromise = Promise.resolve();
    }
  };

  const installSingleSessionDisposal = (activeSession: AgentSession): void => {
    const dispose = activeSession.dispose.bind(activeSession);
    let disposed = false;
    activeSession.dispose = () => {
      if (disposed) return;
      disposed = true;
      dispose();
    };
  };

  const installExtensionSendGuards = (activeSession: AgentSession): void => {
    const actions = extensionRuntime;
    if (!actions) return;
    actions.sendMessage = (message, options) => {
      if (!extensionAdmissionOpen) throw new Error("Agent Run extension activity is closed");
      trackExtensionWork(() => activeSession.sendCustomMessage(message, options));
    };
    actions.sendUserMessage = (content, options) => {
      if (!extensionAdmissionOpen) throw new Error("Agent Run extension activity is closed");
      trackExtensionWork(() => activeSession.sendUserMessage(content, options));
    };
  };

  const disposeRuntime = async (): Promise<void> => {
    const activeRuntime = runtime;
    const activeSession = session;
    if (!activeSession) return;
    if (!activeRuntime || !extensionsBound) {
      try {
        // An unbound session has no matching session_start/session_shutdown lifecycle.
        activeSession.dispose();
      } catch {
        // Disposal is best effort after the outcome has been chosen.
      }
      return;
    }
    const disposal = Promise.resolve()
      .then(() => activeRuntime.dispose())
      .then(() => true)
      .catch(() => false);
    const disposedGracefully = await Promise.race([
      disposal,
      wait(AGENT_RUN_SHUTDOWN_GRACE_MS).then(() => false),
    ]);
    if (!disposedGracefully) {
      try {
        activeSession.dispose();
      } catch {
        // Forced disposal is best effort after graceful shutdown fails or times out.
      }
    }
  };

  const finish = (outcome: AgentRunOutcome<T>): Promise<void> => {
    if (terminal) return finalization ?? Promise.resolve();
    if (finalizing) return finalization ?? Promise.resolve();
    finalizing = true;
    closeSessionAdmission();
    finalization = (async () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = undefined;
      unsubscribe?.();
      unsubscribe = undefined;
      try {
        observerCleanup?.();
      } catch {
        // Observer teardown cannot change the already selected outcome.
      }
      observerCleanup = undefined;
      if (view) deactivateAgentRunSessionView(view);
      await disposeRuntime();
      const finalOutcome = outcomeWithUsage(outcome);
      terminal = true;
      progressState.status = finalOutcome.kind === "success" ? "completed" : finalOutcome.kind;
      progressState.usage = finalOutcome.usage ?? progressState.usage;
      publish();
      resolveResult(finalOutcome);
      runtime = undefined;
      session = undefined;
      view = undefined;
      listeners.clear();
    })();
    return finalization;
  };

  const finishCanceled = (): Promise<void> =>
    finish({ kind: "canceled", diagnostics: diagnostics(), ...usageFields(refreshUsage()) });

  const finishTimeout = (): Promise<void> =>
    finish({
      kind: "timeout",
      timeoutMs: options.timeoutMs ?? 0,
      diagnostics: diagnostics(),
      ...usageFields(refreshUsage()),
    });

  const finishFailed = (failureCode: AgentRunFailureCode): Promise<void> => {
    if (failureCode === "session-creation-failed" && !session) {
      return finish({ kind: "failed", failureCode });
    }
    const diagnosticCode =
      failureCode === "session-creation-failed" ? "session-not-ready" : failureCode;
    return finish({
      kind: "failed",
      failureCode: diagnosticCode,
      diagnostics: diagnostics(),
      ...usageFields(refreshUsage()),
    });
  };

  const abortAndFinish = (kind: "canceled" | "timeout"): Promise<void> => {
    if (abortCompletion !== undefined) return abortCompletion;
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: abort waits for provider, setup callbacks, and bounded disposal races.
    abortCompletion = (async () => {
      if (terminal || finalizing) return;
      if (!sessionSetupFinished) await sessionSetupDone;
      if (terminal || finalizing) return;
      beginAbort();
      await Promise.race([abortPromise ?? Promise.resolve(), wait(AGENT_RUN_ABORT_GRACE_MS)]);
      if (extensionsBound) {
        await Promise.race([setupCallbacksDone, wait(AGENT_RUN_ABORT_GRACE_MS)]);
      }
      if (!promptPreflightSettled) {
        await Promise.race([
          promptPreflightCompletion ?? Promise.resolve(),
          wait(AGENT_RUN_ABORT_GRACE_MS),
        ]);
      }
      if (promptSettlement) {
        await Promise.race([promptSettlement, wait(AGENT_RUN_ABORT_GRACE_MS)]);
      }
      if (completionResolution) {
        await Promise.race([completionResolution, wait(AGENT_RUN_ABORT_GRACE_MS)]);
      }
      if (kind === "timeout") await finishTimeout();
      else await finishCanceled();
    })();
    return abortCompletion;
  };

  const recordCancellationMarker = (): void => {
    if (cancellationMarkerRecorded) return;
    cancellationMarkerRecorded = true;
    lifecycle.recordHostMarker({ type: "abort_requested", reason: "canceled" });
  };

  const requestStop = (kind: "canceled" | "timeout"): Promise<void> => {
    if (stopRequest !== undefined) return stopRequest;
    if (terminal || finalizing || aborting) return finalization ?? Promise.resolve();

    cancelRequested = true;
    timeoutRequested = kind === "timeout";
    aborting = true;
    if (kind === "timeout") {
      lifecycle.recordHostMarker({ type: "timeout_expired" });
      lifecycle.recordHostMarker({ type: "abort_requested", reason: kind });
    } else {
      recordCancellationMarker();
    }
    // Memoize before the fence publishes queue and status events; stop() can be reentrant.
    let resolveStopRequest!: () => void;
    stopRequest = new Promise<void>((resolve) => {
      resolveStopRequest = resolve;
    });
    // This is the Cancellation Fence: no await occurs before admission closes.
    closeSessionAdmission();
    beginAbort();
    void abortAndFinish(kind).then(resolveStopRequest, resolveStopRequest);
    if (!terminal && !finalizing) setStatus("stopping");
    return stopRequest;
  };

  const requestCancellation = (): Promise<void> => requestStop("canceled");

  const requestTimeout = (): void => {
    if (terminal || finalizing || aborting || !promptStarted) return;
    void requestStop("timeout");
  };

  const dispatchEvent = (event: AgentSessionEvent): void => {
    lifecycle.observe(event);
    if (event.type === "turn_end") progressState.turns++;
    if (event.type === "tool_execution_start") progressState.toolUses++;
    if (event.type === "tool_execution_end" && event.isError) progressState.toolErrors++;
    if (
      event.type === "turn_end" ||
      event.type === "tool_execution_start" ||
      event.type === "tool_execution_end" ||
      event.type === "agent_settled"
    ) {
      refreshUsage();
      publish();
    }
    if (event.type !== "agent_settled" || aborting || terminal || finalizing) return;
    settledEventObserved = true;
    promptActive = false;
  };

  const pendingMessageCount = (activeSession: AgentSession): number | undefined => {
    try {
      return activeSession.pendingMessageCount;
    } catch {
      return undefined;
    }
  };

  const hasNoPendingMessages = (activeSession: AgentSession): boolean => {
    const pending = pendingMessageCount(activeSession);
    if (pending === undefined) throw new Error("Unable to inspect Agent Run queues");
    return pending === 0;
  };

  const isQuiescent = (activeSession: AgentSession): boolean =>
    extensionWork.size === 0 && activeSession.isIdle && hasNoPendingMessages(activeSession);

  const awaitSessionQuiescence = async (activeSession: AgentSession): Promise<void> => {
    for (;;) {
      const pending = [...extensionWork];
      if (pending.length > 0) await Promise.allSettled(pending);
      await activeSession.agent.waitForIdle();
      await activeSession.waitForIdle();
      await Promise.resolve();
      if (!isQuiescent(activeSession)) continue;
      await Promise.resolve();
      if (isQuiescent(activeSession)) return;
    }
  };

  const authorizedContinuationModel = (model: Model<Api>): boolean =>
    [options.inputs.model, ...(options.inputs.authorizedContinuationModels ?? [])].some(
      (candidate) => candidate.provider === model.provider && candidate.id === model.id,
    );

  const latestAssistant = (activeSession: AgentSession): object | undefined => {
    try {
      return [...activeSession.messages]
        .reverse()
        .find((message) => message !== null && message.role === "assistant");
    } catch {
      return undefined;
    }
  };

  const isProviderError = (activeSession: AgentSession, previous?: object): boolean => {
    const assistant = latestAssistant(activeSession);
    if (!assistant || assistant === previous) return false;
    return (assistant as { stopReason?: unknown }).stopReason === "error";
  };

  const executeContinuationStep = async (
    activeSession: AgentSession,
    step: AgentRunContinuationStep,
    turn: number,
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one audited step owns model, tool, prompt, and usage mechanics.
  ): Promise<AgentRunContinuationTurn | undefined> => {
    if (aborting || terminal || finalizing) return undefined;
    const currentModelId = activeSession.model
      ? `${activeSession.model.provider}/${activeSession.model.id}`
      : `${options.inputs.model.provider}/${options.inputs.model.id}`;
    const requestedModelId = step.model?.modelId ?? currentModelId;
    observeContinuation({ type: "turn-start", turn, modelId: requestedModelId });
    if (aborting || terminal || finalizing) return undefined;
    const usageBefore = collectAgentRunUsage(activeSession);
    if (step.model) {
      const requested = step.model.value as Model<Api> | undefined;
      const modelIdMatches = requested
        ? `${requested.provider}/${requested.id}` === requestedModelId
        : false;
      let switched = false;
      if (
        requested &&
        modelIdMatches &&
        authorizedContinuationModel(requested) &&
        selectAuthorizedModel?.(requested)
      ) {
        try {
          await activeSession.setModel(requested);
          if (aborting || terminal || finalizing) return undefined;
          switched = true;
        } catch {
          // An unavailable authorized model fails this finite step closed.
        }
      }
      observeContinuation({
        type: "model-switch",
        turn,
        modelId: requestedModelId,
        success: switched,
      });
      if (!switched) {
        const failed: AgentRunContinuationTurn = {
          turn,
          modelId: requestedModelId,
          outcome: "model-switch-failed",
          promptAccepted: false,
          ...usageDeltaFields(usageBefore, collectAgentRunUsage(activeSession)),
        };
        observeContinuationTurn(failed);
        observeContinuation({
          type: "turn-end",
          turn,
          modelId: requestedModelId,
          outcome: failed.outcome,
        });
        return failed;
      }
    }
    if (aborting || terminal || finalizing) return undefined;
    activeSession.setActiveToolsByName([...step.activeTools]);
    activeSession.setThinkingLevel(step.thinkingLevel);
    const previousAssistant = latestAssistant(activeSession);
    let accepted = false;
    let promptFailed = false;
    try {
      await activeSession.prompt(step.prompt, {
        preflightResult: (success) => {
          accepted = success;
          if (success && (aborting || terminal || finalizing)) {
            throw new Error("Agent Run continuation canceled before acceptance");
          }
        },
      });
    } catch {
      promptFailed = true;
    }
    try {
      await awaitSessionQuiescence(activeSession);
    } catch {
      promptFailed = true;
    }
    const outcome =
      !accepted || promptFailed || isProviderError(activeSession, previousAssistant)
        ? "provider-failed"
        : "settled";
    const completed: AgentRunContinuationTurn = {
      turn,
      modelId: requestedModelId,
      outcome,
      promptAccepted: accepted,
      ...usageDeltaFields(usageBefore, collectAgentRunUsage(activeSession)),
    };
    observeContinuationTurn(completed);
    observeContinuation({ type: "turn-end", turn, modelId: requestedModelId, outcome });
    return completed;
  };

  const runContinuation = async (
    initialFailureCode: AgentRunContinuationFailureCode,
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the bounded loop keeps continuation and terminal selection in the lifecycle closure.
  ): Promise<void> => {
    const policy = options.continuation;
    const activeSession = session;
    const activeView = view;
    const finiteBound =
      policy &&
      Number.isSafeInteger(policy.maxTurns) &&
      policy.maxTurns >= 1 &&
      policy.maxTurns <= AGENT_RUN_MAX_CONTINUATION_TURNS;
    if (!finiteBound || !activeSession || !activeView || !promptAccepted) {
      await finishFailed(initialFailureCode);
      return;
    }
    continuationInitialFailure ??= initialFailureCode;
    const maximumTurns = policy.maxTurns;
    while (continuationTurn < maximumTurns && !aborting && !terminal && !finalizing) {
      const nextTurn = continuationTurn + 1;
      let step: AgentRunContinuationStep | undefined;
      try {
        step = await policy.resolveNext({
          session: activeView,
          initialFailureCode: continuationInitialFailure,
          nextTurn,
          ...(previousContinuationTurn ? { previousTurn: previousContinuationTurn } : {}),
        });
      } catch {
        step = undefined;
      }
      if (aborting || terminal || finalizing) return;
      if (!step) break;
      continuationTurn = nextTurn;
      const turn = await executeContinuationStep(activeSession, step, nextTurn);
      if (aborting || terminal || finalizing || !turn) return;
      if (turn.outcome !== "settled") continue;
      try {
        const value = await options.completionResolver(activeView);
        if (aborting || terminal || finalizing) return;
        if (value !== undefined) {
          await finish(outcomeWithUsage({ kind: "success", value }));
          return;
        }
      } catch {
        // A failed resolver leaves the original failure authoritative.
      }
    }
    if (!aborting && !terminal && !finalizing) {
      await finishFailed(continuationInitialFailure);
    }
  };

  const startPromptSettlement = (): void => {
    if (promptSettlement || !promptPromiseSettled || aborting || terminal || finalizing) return;
    const activeSession = session;
    if (!activeSession) return;
    const settlement = (async () => {
      try {
        await awaitSessionQuiescence(activeSession);
      } catch {
        if (!aborting && !terminal && !finalizing) await finishFailed("unexpected-runner-failure");
        return;
      }
      if (aborting || terminal || finalizing) return;
      if (isProviderError(activeSession)) {
        await runContinuation("unexpected-runner-failure");
        return;
      }
      startCompletionResolution();
    })();
    promptSettlement = settlement;
    void settlement.then(
      () => {
        if (promptSettlement === settlement) promptSettlement = undefined;
      },
      () => {
        if (promptSettlement === settlement) promptSettlement = undefined;
      },
    );
  };

  const startPromptFailureSettlement = (
    failureCode: "prompt-rejected" | "unexpected-runner-failure",
  ): void => {
    if (promptSettlement || aborting || terminal || finalizing) return;
    const activeSession = session;
    if (!activeSession) {
      void finishFailed(failureCode);
      return;
    }
    if (failureCode === "prompt-rejected" || !promptAccepted) closeSessionAdmission();
    const settlement = (async () => {
      try {
        await awaitSessionQuiescence(activeSession);
      } catch {
        // The prompt already failed; select its failure even if idle inspection fails.
      }
      if (aborting || terminal || finalizing) return;
      if (failureCode === "unexpected-runner-failure" && promptAccepted) {
        await runContinuation(failureCode);
      } else {
        await finishFailed(failureCode);
      }
    })();
    promptSettlement = settlement;
    void settlement.then(
      () => {
        if (promptSettlement === settlement) promptSettlement = undefined;
      },
      () => {
        if (promptSettlement === settlement) promptSettlement = undefined;
      },
    );
  };

  async function resolveCompletion(): Promise<void> {
    if (terminal || finalizing || aborting || resolvingCompletion || !view) return;
    resolvingCompletion = true;
    try {
      const value = await options.completionResolver(view);
      if (terminal || finalizing || aborting) return;
      if (value === undefined) {
        await runContinuation("missing-completion");
      } else {
        await finish(outcomeWithUsage({ kind: "success", value }));
      }
    } catch {
      if (!terminal && !finalizing && !aborting) {
        await runContinuation("unexpected-runner-failure");
      }
    } finally {
      resolvingCompletion = false;
    }
  }

  const startCompletionResolution = (): void => {
    if (completionResolution || resolvingCompletion) return;
    const resolution = resolveCompletion();
    completionResolution = resolution;
    void resolution.then(
      () => {
        if (completionResolution === resolution) completionResolution = undefined;
      },
      () => {
        if (completionResolution === resolution) completionResolution = undefined;
      },
    );
  };

  const startPrompt = (): void => {
    if (cancelRequested || terminal || finalizing || !session) return;
    promptStarted = true;
    promptActive = false;
    let resolvePromptPreflight!: () => void;
    promptPreflightCompletion = new Promise<void>((resolve) => {
      resolvePromptPreflight = resolve;
    });
    const settlePromptPreflight = (): void => {
      if (promptPreflightSettled) return;
      promptPreflightSettled = true;
      resolvePromptPreflight();
    };
    if (options.timeoutMs !== undefined) {
      timeoutId = setTimeout(requestTimeout, options.timeoutMs);
      timeoutId.unref?.();
    }
    const onPreflight = (accepted: boolean): void => {
      settlePromptPreflight();
      if (!accepted) {
        promptActive = false;
        if (cancelRequested || timeoutRequested || aborting || terminal || finalizing) return;
        lifecycle.recordHostMarker({ type: "prompt_rejected" });
        promptFailureCode = "prompt-rejected";
        return;
      }
      if (cancelRequested || timeoutRequested || aborting || terminal || finalizing) {
        throw new Error("Agent Run prompt canceled before acceptance");
      }
      promptAccepted = true;
      promptActive = true;
    };
    try {
      const promptPromise = session.prompt(options.prompt, { preflightResult: onPreflight });
      void Promise.resolve(promptPromise).then(
        () => {
          settlePromptPreflight();
          promptPromiseSettled = true;
          promptActive = false;
          if (promptFailureCode) startPromptFailureSettlement(promptFailureCode);
          else startPromptSettlement();
        },
        () => {
          settlePromptPreflight();
          promptPromiseSettled = true;
          promptActive = false;
          promptFailureCode ??= "unexpected-runner-failure";
          startPromptFailureSettlement(promptFailureCode);
        },
      );
    } catch {
      settlePromptPreflight();
      promptPromiseSettled = true;
      promptActive = false;
      promptFailureCode ??= "unexpected-runner-failure";
      startPromptFailureSettlement(promptFailureCode);
    }
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: setup orders uncancelable resource, session, binding, readiness, and prompt phases.
  const setup = async (): Promise<void> => {
    try {
      if (cancelRequested) return;
      await options.inputs.resourceLoader.reload();
      if (cancelRequested) {
        markSessionSetupFinished();
        return;
      }
      const agentDir = options.inputs.agentDir ?? process.env.PI_CODING_AGENT_DIR ?? getAgentDir();
      runtime = await createAgentSessionRuntime(
        async ({ cwd, agentDir: runtimeAgentDir, sessionManager, sessionStartEvent }) => {
          const createdModelRuntime = await createAgentRunModelRuntime(
            options.inputs.providerAuthority,
            [
              options.inputs.model as Model<Api>,
              ...((options.inputs.authorizedContinuationModels ?? []) as Model<Api>[]),
            ],
          );
          selectAuthorizedModel = createdModelRuntime.selectModel;
          const modelRuntime = createdModelRuntime.runtime;
          const created = await createAgentSession({
            cwd,
            agentDir: runtimeAgentDir,
            model: options.inputs.model,
            modelRuntime,
            thinkingLevel: options.inputs.thinkingLevel,
            tools: [...options.inputs.tools],
            customTools: options.inputs.customTools ? [...options.inputs.customTools] : undefined,
            resourceLoader: options.inputs.resourceLoader,
            settingsManager: options.inputs.settingsManager,
            sessionManager,
            sessionStartEvent,
          });
          extensionRuntime = created.extensionsResult.runtime;
          return {
            ...created,
            services: {
              cwd,
              agentDir: runtimeAgentDir,
              modelRuntime,
              settingsManager: options.inputs.settingsManager,
              resourceLoader: options.inputs.resourceLoader,
              diagnostics: [],
            },
            diagnostics: [],
          };
        },
        {
          cwd: options.inputs.cwd,
          agentDir,
          sessionManager: SessionManager.inMemory(options.inputs.cwd),
        },
      );
      session = runtime.session;
      installSingleSessionDisposal(session);
      installExtensionSendGuards(session);
      if (cancelRequested || terminal || finalizing) {
        markSessionSetupFinished();
        closeSessionAdmission();
        return;
      }
      try {
        await session.bindExtensions({ mode: "print" });
        extensionsBound = true;
      } finally {
        markSessionSetupFinished();
      }
      if (cancelRequested || terminal || finalizing) return;
      if (options.inputs.initialActiveTools) {
        session.setActiveToolsByName([...options.inputs.initialActiveTools]);
      }
      lifecycle = new AgentRunLifecycleTraceCollector(getRegisteredToolNames(session));
      unsubscribe = session.subscribe(dispatchEvent);
      const activeView = createAgentRunSessionView(session, options.inputs.cwd);
      view = activeView;
      if (options.observer) {
        try {
          const cleanup = await options.observer(activeView);
          if (typeof cleanup === "function") {
            if (cancelRequested || terminal || finalizing) {
              try {
                cleanup();
              } catch {
                // A late observer disposer cannot change the selected outcome.
              }
            } else {
              observerCleanup = cleanup;
            }
          }
        } catch {
          if (cancelRequested) return;
          await finishFailed("session-not-ready");
          return;
        }
      }
      if (cancelRequested) return;
      if (options.readinessCheck) {
        let ready = true;
        try {
          ready = (await options.readinessCheck(activeView)) !== false;
        } catch {
          ready = false;
        }
        if (cancelRequested) return;
        if (!ready) {
          await finishFailed("session-not-ready");
          return;
        }
      }
      if (cancelRequested) return;
      setStatus("running");
      startPrompt();
    } catch {
      if (cancelRequested) return;
      await finishFailed(session ? "session-not-ready" : "session-creation-failed");
    } finally {
      markSessionSetupFinished();
      resolveSetupCallbacksFinished();
      if (cancelRequested && !terminal && !finalizing) {
        await abortAndFinish(timeoutRequested ? "timeout" : "canceled");
      }
    }
  };

  const handle: AgentRunHandle<T> = {
    result,
    subscribe(listener) {
      listeners.add(listener);
      try {
        listener(snapshot());
      } catch {
        // A subscriber cannot affect setup or settlement.
      }
      return () => listeners.delete(listener);
    },
    steer: async (message): Promise<AgentRunSteerResult> => {
      if (
        progressState.status !== "running" ||
        !session ||
        !promptActive ||
        !session.isStreaming ||
        settledEventObserved ||
        terminal ||
        finalizing ||
        aborting
      )
        return "not-running";
      const activeSession = session;
      const admissionAtStart = admissionGeneration;
      try {
        await activeSession.steer(message);
        if (!extensionAdmissionOpen || admissionGeneration !== admissionAtStart) {
          try {
            activeSession.clearQueue();
          } catch {
            // A late queue write is inert once the session is closing.
          }
          return "not-running";
        }
        return "accepted";
      } catch {
        return "not-running";
      }
    },
    stop: requestCancellation,
  };

  publish();
  if (options.signal) {
    const onAbort = (): void => {
      void requestCancellation();
    };
    options.signal.addEventListener("abort", onAbort, { once: true });
    if (options.signal.aborted) onAbort();
    result
      .finally(() => options.signal?.removeEventListener("abort", onAbort))
      .catch(() => undefined);
  }
  void setup();
  return handle;
}

function usageFields(usage: Usage | undefined): { usage?: Usage } {
  return usage ? { usage } : {};
}

function usageDeltaFields(before: Usage | undefined, after: Usage | undefined): { usage?: Usage } {
  const delta = subtractUsage(after, before);
  return delta ? { usage: delta } : {};
}

function subtractUsage(after: Usage | undefined, before: Usage | undefined): Usage | undefined {
  if (!after) return undefined;
  const nonNegative = (value: number) => Math.max(0, value);
  const optionalDifference = (next: number | undefined, previous: number | undefined) =>
    next === undefined && previous === undefined
      ? undefined
      : nonNegative((next ?? 0) - (previous ?? 0));
  const cacheWrite1h = optionalDifference(after.cacheWrite1h, before?.cacheWrite1h);
  const reasoning = optionalDifference(after.reasoning, before?.reasoning);
  const usage: Usage = {
    input: nonNegative(after.input - (before?.input ?? 0)),
    output: nonNegative(after.output - (before?.output ?? 0)),
    cacheRead: nonNegative(after.cacheRead - (before?.cacheRead ?? 0)),
    cacheWrite: nonNegative(after.cacheWrite - (before?.cacheWrite ?? 0)),
    totalTokens: nonNegative(after.totalTokens - (before?.totalTokens ?? 0)),
    cost: {
      input: nonNegative(after.cost.input - (before?.cost.input ?? 0)),
      output: nonNegative(after.cost.output - (before?.cost.output ?? 0)),
      cacheRead: nonNegative(after.cost.cacheRead - (before?.cost.cacheRead ?? 0)),
      cacheWrite: nonNegative(after.cost.cacheWrite - (before?.cost.cacheWrite ?? 0)),
      total: nonNegative(after.cost.total - (before?.cost.total ?? 0)),
    },
    ...(cacheWrite1h === undefined ? {} : { cacheWrite1h }),
    ...(reasoning === undefined ? {} : { reasoning }),
  };
  return hasUsage(usage) ? usage : undefined;
}

function hasUsage(usage: Usage): boolean {
  return (
    usage.input > 0 ||
    usage.output > 0 ||
    usage.cacheRead > 0 ||
    usage.cacheWrite > 0 ||
    usage.totalTokens > 0 ||
    usage.cost.total > 0 ||
    (usage.cacheWrite1h ?? 0) > 0 ||
    (usage.reasoning ?? 0) > 0
  );
}

function cloneUsage(usage: Usage): Usage {
  return {
    ...usage,
    cost: { ...usage.cost },
  };
}

function freezeProgress(progress: AgentRunProgress): AgentRunProgress {
  if (progress.usage) {
    Object.freeze(progress.usage.cost);
    Object.freeze(progress.usage);
  }
  return Object.freeze(progress);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, milliseconds);
    timeout.unref?.();
  });
}
