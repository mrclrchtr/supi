// biome-ignore lint/style/noExcessiveLinesPerFile: the Agent Run state machine keeps lifecycle ownership auditable in one closure.
import type { Usage } from "@earendil-works/pi-ai";
import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionRuntime,
} from "@earendil-works/pi-coding-agent";
import {
  createAgentSession,
  createAgentSessionRuntime,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { buildAgentRunDiagnostics } from "./diagnostics.ts";
import { AgentRunLifecycleTraceCollector, getRegisteredToolNames } from "./lifecycle-trace.ts";
import { createAgentRunSessionView, deactivateAgentRunSessionView } from "./session-view.ts";
import type {
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
  let promptPreflightCompletion: Promise<void> | undefined;
  let promptAccepted = false;
  let promptPromiseSettled = false;
  let settledEventObserved = false;
  let deferredSettlement = false;
  let cancelRequested = false;
  let timeoutRequested = false;
  let cancellationMarkerRecorded = false;
  let resolvingCompletion = false;
  let completionResolution: Promise<void> | undefined;
  let aborting = false;
  let setupFinished = false;
  let finalizing = false;
  let terminal = false;
  let finalization: Promise<void> | undefined;
  let abortCompletion: Promise<void> | undefined;
  let stopRequest: Promise<void> | undefined;
  let resolveSetupFinished!: () => void;
  const setupDone = new Promise<void>((resolve) => {
    resolveSetupFinished = resolve;
  });
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

  const disposeRuntime = async (): Promise<void> => {
    if (!runtime) {
      try {
        session?.dispose();
      } catch {
        // Disposal is best effort after the outcome has been chosen.
      }
      return;
    }
    const disposal = Promise.resolve()
      .then(() => runtime?.dispose())
      .then(() => true)
      .catch(() => false);
    const disposedGracefully = await Promise.race([
      disposal,
      wait(AGENT_RUN_SHUTDOWN_GRACE_MS).then(() => false),
    ]);
    if (!disposedGracefully) {
      try {
        session?.dispose();
      } catch {
        // Forced disposal is best effort after graceful shutdown fails or times out.
      }
    }
  };

  const finish = (outcome: AgentRunOutcome<T>): Promise<void> => {
    if (terminal) return finalization ?? Promise.resolve();
    if (finalizing) return finalization ?? Promise.resolve();
    finalizing = true;
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
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: abort waits for provider, preflight, and bounded disposal races.
    abortCompletion = (async () => {
      if (terminal || finalizing) return;
      const activeSession = session;
      if (!activeSession) {
        if (kind === "timeout") await finishTimeout();
        else await finishCanceled();
        return;
      }
      const abortPromise = Promise.resolve()
        .then(() => activeSession.abort())
        .catch(() => undefined);
      await Promise.race([abortPromise, wait(AGENT_RUN_ABORT_GRACE_MS)]);
      if (!promptPreflightSettled) {
        await Promise.race([
          promptPreflightCompletion ?? Promise.resolve(),
          wait(AGENT_RUN_ABORT_GRACE_MS),
        ]);
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

  const requestCancellation = (): Promise<void> => {
    if (stopRequest !== undefined) return stopRequest;
    // Memoize before publishing `stopping`; progress listeners may call stop() reentrantly.
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: cancellation coordinates setup, abort, and timeout races.
    stopRequest = (async () => {
      await Promise.resolve();
      if (!setupFinished) {
        await setupDone;
        if (terminal) return;
      }
      if (terminal) return;
      if (finalizing) {
        await (finalization ?? Promise.resolve());
        return;
      }
      if (aborting || timeoutRequested) {
        await (abortCompletion ?? finalization ?? Promise.resolve());
        return;
      }
      aborting = true;
      recordCancellationMarker();
      if (promptStarted) await abortAndFinish("canceled");
      else await finishCanceled();
    })();
    cancelRequested = true;
    if (!terminal && !finalizing) setStatus("stopping");
    return stopRequest;
  };

  const requestTimeout = (): void => {
    if (terminal || finalizing || aborting || !promptStarted) return;
    timeoutRequested = true;
    aborting = true;
    lifecycle.recordHostMarker({ type: "timeout_expired" });
    lifecycle.recordHostMarker({ type: "abort_requested", reason: "timeout" });
    const abortPromise = abortAndFinish("timeout");
    setStatus("stopping");
    void abortPromise;
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
    if (!promptAccepted || !promptPromiseSettled) {
      deferredSettlement = true;
      return;
    }
    startCompletionResolution();
  };

  const flushSettlement = (): void => {
    if (
      !deferredSettlement ||
      !promptAccepted ||
      !promptPromiseSettled ||
      aborting ||
      terminal ||
      finalizing
    ) {
      return;
    }
    deferredSettlement = false;
    startCompletionResolution();
  };

  async function resolveCompletion(): Promise<void> {
    if (terminal || finalizing || aborting || resolvingCompletion || !view) return;
    resolvingCompletion = true;
    try {
      const value = await options.completionResolver(view);
      if (terminal || finalizing || aborting) return;
      if (value === undefined) {
        await finishFailed("missing-completion");
      } else {
        await finish(outcomeWithUsage({ kind: "success", value }));
      }
    } catch {
      if (!terminal && !finalizing && !aborting) await finishFailed("unexpected-runner-failure");
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
        void finishFailed("prompt-rejected");
        return;
      }
      if (cancelRequested || timeoutRequested || aborting || terminal || finalizing) {
        throw new Error("Agent Run prompt canceled before acceptance");
      }
      promptActive = true;
      promptAccepted = true;
      flushSettlement();
    };
    try {
      const promptPromise = session.prompt(options.prompt, { preflightResult: onPreflight });
      void Promise.resolve(promptPromise).then(
        () => {
          settlePromptPreflight();
          promptPromiseSettled = true;
          promptActive = false;
          promptAccepted = true;
          if (settledEventObserved) flushSettlement();
          else if (!cancelRequested && !timeoutRequested && !aborting) startCompletionResolution();
        },
        () => {
          settlePromptPreflight();
          promptPromiseSettled = true;
          promptActive = false;
          if (!terminal && !finalizing && !aborting) void finishFailed("unexpected-runner-failure");
        },
      );
    } catch {
      settlePromptPreflight();
      promptActive = false;
      void finishFailed("unexpected-runner-failure");
    }
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: setup orders uncancelable resource, session, binding, readiness, and prompt phases.
  const setup = async (): Promise<void> => {
    try {
      if (cancelRequested) return;
      await options.inputs.resourceLoader.reload();
      if (cancelRequested) return;
      const agentDir = options.inputs.agentDir ?? process.env.PI_CODING_AGENT_DIR ?? getAgentDir();
      runtime = await createAgentSessionRuntime(
        async ({ cwd, agentDir: runtimeAgentDir, sessionManager, sessionStartEvent }) => {
          const created = await createAgentSession({
            cwd,
            agentDir: runtimeAgentDir,
            model: options.inputs.model,
            thinkingLevel: options.inputs.thinkingLevel,
            tools: [...options.inputs.tools],
            customTools: options.inputs.customTools ? [...options.inputs.customTools] : undefined,
            resourceLoader: options.inputs.resourceLoader,
            settingsManager: options.inputs.settingsManager,
            sessionManager,
            sessionStartEvent,
          });
          return {
            ...created,
            services: {
              cwd,
              agentDir: runtimeAgentDir,
              modelRuntime: created.session.modelRuntime,
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
      await session.bindExtensions({ mode: "print" });
      lifecycle = new AgentRunLifecycleTraceCollector(getRegisteredToolNames(session));
      unsubscribe = session.subscribe(dispatchEvent);
      view = createAgentRunSessionView(session, options.inputs.cwd);
      if (options.observer) {
        try {
          const cleanup = await options.observer(view);
          if (typeof cleanup === "function") observerCleanup = cleanup;
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
          ready = (await options.readinessCheck(view)) !== false;
        } catch {
          ready = false;
        }
        if (!ready) {
          if (cancelRequested) return;
          await finishFailed("session-not-ready");
          return;
        }
      }
      if (cancelRequested) return;
      setStatus("running");
      setupFinished = true;
      resolveSetupFinished();
      startPrompt();
    } catch {
      if (cancelRequested) return;
      await finishFailed(session ? "session-not-ready" : "session-creation-failed");
    } finally {
      setupFinished = true;
      resolveSetupFinished();
      if (cancelRequested && !terminal && !finalizing) {
        aborting = true;
        if (!timeoutRequested) recordCancellationMarker();
        if (promptStarted) await abortAndFinish(timeoutRequested ? "timeout" : "canceled");
        else await finishCanceled();
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
      try {
        await session.steer(message);
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
