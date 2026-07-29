import type { Usage } from "@earendil-works/pi-ai";
import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ChildFailureCode, ChildFailureDiagnostics, ReviewProgress } from "../types.ts";
import { buildChildFailureDiagnostics } from "./child-failure-diagnostics.ts";
import {
  type ChildLifecycleHostMarker,
  type ChildLifecycleTrace,
  ChildLifecycleTraceCollector,
  getRegisteredToolNames,
} from "./child-lifecycle-trace.ts";
import { collectChildUsage } from "./child-usage.ts";

/** Maximum time cancellation waits for a provider abort before host cleanup continues. */
export const CHILD_ABORT_GRACE_MS = 2_000;

/**
 * Context passed to event handlers, timeout callbacks, and result factories.
 */
export interface LifecycleCtx<TResult> {
  /** Resolve the lifecycle promise with a result. */
  resolve: (result: TResult) => void;
  /**
   * Safely finalize: mark as settled, run all teardown, dispose session.
   * Idempotent — subsequent calls are no-ops.
   */
  cleanup: (result: TResult) => TResult;
  /** Shared progress state for tracking turns, tool uses, and tokens. */
  progress: ReviewProgress;
  /**
   * Shared lifecycle state.
   * - `settled`: true once cleanup has been called
   * - `aborting`: true once abort/timeout begins (prevents agent_settled from resolving)
   */
  state: { settled: boolean; aborting: boolean };
  /** The managed agent session. */
  session: AgentSession;
  /** Snapshot the bounded Child Lifecycle Trace observed so far. */
  getLifecycleTrace: () => ChildLifecycleTrace;
  /** Build a safe non-success diagnostic artifact from the observed child run. */
  getFailureDiagnostics: () => ChildFailureDiagnostics;
  /** Aggregate nested-model usage observed in the child transcript. */
  getUsage: () => Usage | undefined;
  /** Add one allowlisted runner-control marker to the Child Lifecycle Trace. */
  recordHostMarker: (marker: ChildLifecycleHostMarker) => void;
}

/** Configuration for `runWithLifecycle`. */
export interface RunWithLifecycleConfig<TResult> {
  /** The agent session to manage. */
  session: AgentSession;
  /** The prompt to send to the session. */
  prompt: string;
  /** Optional abort signal. */
  signal?: AbortSignal;
  /** Optional timeout in milliseconds before the session is aborted. */
  timeoutMs?: number;
  /** Optional owner teardown; used when an AgentSessionRuntime owns session shutdown. */
  dispose?: () => void;
  /**
   * Event handler. Receives each session event and the lifecycle context.
   * Call `ctx.resolve(ctx.cleanup(result))` to settle the promise.
   */
  onEvent: (event: AgentSessionEvent, ctx: LifecycleCtx<TResult>) => void;
  /** Factory for the result produced when the abort signal fires. */
  canceledResult: (ctx: LifecycleCtx<TResult>) => TResult;
  /** Factory for the result produced when prompt preflight or execution fails. */
  failedResult: (
    code: Extract<ChildFailureCode, "prompt-rejected" | "unexpected-runner-failure">,
    ctx: LifecycleCtx<TResult>,
  ) => TResult;
  /** Factory for the result produced when the timeout expires (default hard abort). */
  timeoutResult: (timeoutMs: number, ctx: LifecycleCtx<TResult>) => TResult;
}

interface StartPromptOptions {
  session: AgentSession;
  prompt: string;
  onPreflightRejected: () => void;
  onFulfilled: () => void;
  onUnexpectedFailure: () => void;
}

function startPrompt(options: StartPromptOptions): void {
  const { session, prompt, onPreflightRejected, onFulfilled, onUnexpectedFailure } = options;
  try {
    const promptPromise = session.prompt(prompt, {
      preflightResult: (accepted) => !accepted && onPreflightRejected(),
    });
    void promptPromise.then(onFulfilled, onUnexpectedFailure);
  } catch {
    onUnexpectedFailure();
  }
}

/**
 * Manages the lifecycle of a child agent session: subscribes to events,
 * wires abort-signal handling, enforces a timeout, and provides idempotent
 * cleanup. The caller supplies the structured event/result mapping.
 *
 * The returned promise resolves when:
 * - The event handler calls `ctx.resolve(ctx.cleanup(result))`
 * - The abort signal fires (resolves via `canceledResult(ctx)`)
 * - The optional timeout expires and resolves via `timeoutResult`
 * - `session.prompt()` rejects (resolves via `failedResult`)
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: lifecycle ownership must remain in one state-machine closure
export function runWithLifecycle<TResult>(
  config: RunWithLifecycleConfig<TResult>,
): Promise<TResult> {
  const {
    session,
    prompt,
    signal,
    timeoutMs,
    dispose,
    onEvent,
    canceledResult,
    failedResult,
    timeoutResult,
  } = config;

  const progress: ReviewProgress = {
    turns: 0,
    toolUses: 0,
    tokens: undefined,
  };
  const state: { settled: boolean; aborting: boolean } = {
    settled: false,
    aborting: false,
  };
  const teardownFns: (() => void)[] = [];
  const lifecycleTrace = new ChildLifecycleTraceCollector(getRegisteredToolNames(session));

  const cancelTeardown = (): void => {
    for (const fn of teardownFns) {
      try {
        fn();
      } catch {
        // ignore teardown errors
      }
    }
    teardownFns.length = 0;
  };

  const addTeardown = (fn: () => void): void => {
    teardownFns.push(fn);
  };

  const cleanup = (result: TResult): TResult => {
    if (state.settled) return result;
    state.settled = true;
    cancelTeardown();
    try {
      if (dispose) dispose();
      else session.dispose();
    } catch {
      // Disposal is best-effort after the outcome is already determined.
    }
    return result;
  };

  return new Promise<TResult>((resolve) => {
    const ctx: LifecycleCtx<TResult> = {
      resolve,
      cleanup,
      progress,
      state,
      session,
      getLifecycleTrace: () => lifecycleTrace.snapshot(),
      getFailureDiagnostics: () =>
        buildChildFailureDiagnostics({
          progress,
          session,
          lifecycleTrace: lifecycleTrace.snapshot(),
          recentActivity: lifecycleTrace.recentActivitySnapshot(),
        }),
      getUsage: () => collectChildUsage(session),
      recordHostMarker: (marker) => lifecycleTrace.recordHostMarker(marker),
    };

    let promptSettled = false;
    let deferredAgentSettled: Extract<AgentSessionEvent, { type: "agent_settled" }> | undefined;

    const dispatchEvent = (event: AgentSessionEvent): void => {
      try {
        onEvent(event, ctx);
      } catch {
        if (!state.settled && !state.aborting) {
          resolve(cleanup(failedResult("unexpected-runner-failure", ctx)));
        }
      }
    };

    const flushDeferredSettlement = (): void => {
      if (!deferredAgentSettled || state.settled || state.aborting) return;
      const event = deferredAgentSettled;
      deferredAgentSettled = undefined;
      dispatchEvent(event);
    };

    const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
      lifecycleTrace.observe(event);
      if (event.type === "agent_settled" && !promptSettled) {
        deferredAgentSettled = event;
        return;
      }
      dispatchEvent(event);
    });
    if (typeof unsubscribe === "function") addTeardown(unsubscribe);

    const finishAfterAbort = (result: () => TResult): void => {
      let graceId: ReturnType<typeof setTimeout> | undefined;
      const grace = new Promise<void>((resolveGrace) => {
        graceId = setTimeout(resolveGrace, CHILD_ABORT_GRACE_MS);
        graceId.unref?.();
      });
      const abort = Promise.resolve()
        .then(() => session.abort())
        .catch(() => undefined);
      void Promise.race([abort, grace]).finally(() => {
        if (graceId) clearTimeout(graceId);
        resolve(cleanup(result()));
      });
    };

    // Abort signal handler
    const onAbort = () => {
      if (state.settled || state.aborting) return;
      state.aborting = true;
      ctx.recordHostMarker({ type: "abort_requested", reason: "canceled" });
      finishAfterAbort(() => canceledResult(ctx));
    };
    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
      addTeardown(() => signal.removeEventListener("abort", onAbort));
      if (signal.aborted) {
        onAbort();
        return;
      }
    }

    // Timeout handler
    const onTimeoutExpired = () => {
      if (timeoutMs === undefined || state.settled || state.aborting) return;
      ctx.recordHostMarker({ type: "timeout_expired" });

      state.aborting = true;
      ctx.recordHostMarker({ type: "abort_requested", reason: "timeout" });
      finishAfterAbort(() => timeoutResult(timeoutMs, ctx));
    };
    if (timeoutMs !== undefined) {
      const timeoutId = setTimeout(onTimeoutExpired, timeoutMs);
      timeoutId.unref?.();
      addTeardown(() => clearTimeout(timeoutId));
    }

    // Start the session. Prompt rejection is a distinct host-owned outcome;
    // caught provider or runner errors are intentionally never retained.
    const rejectPrompt = () => {
      if (state.settled || state.aborting) return;
      ctx.recordHostMarker({ type: "prompt_rejected" });
      resolve(cleanup(failedResult("prompt-rejected", ctx)));
    };
    const failUnexpectedly = () => {
      promptSettled = true;
      if (state.settled || state.aborting) return;
      resolve(cleanup(failedResult("unexpected-runner-failure", ctx)));
    };
    startPrompt({
      session,
      prompt,
      onPreflightRejected: rejectPrompt,
      onUnexpectedFailure: failUnexpectedly,
      onFulfilled: () => {
        promptSettled = true;
        flushDeferredSettlement();
      },
    });
  });
}
