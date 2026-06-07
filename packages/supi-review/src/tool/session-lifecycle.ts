import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ReviewProgress } from "./runner-types.ts";

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
   * - `aborting`: true once abort/timeout begins (prevents agent_end from resolving)
   */
  state: { settled: boolean; aborting: boolean };
  /** The managed agent session. */
  session: AgentSession;
  /**
   * Register a teardown function that runs when cleanup is called.
   * Useful for custom timers or resources set up by `onTimeout`.
   */
  addTeardown: (fn: () => void) => void;
}

/** Configuration for `runWithLifecycle`. */
export interface RunWithLifecycleConfig<TResult> {
  /** The agent session to manage. */
  session: AgentSession;
  /** The prompt to send to the session. */
  prompt: string;
  /** Optional abort signal. */
  signal?: AbortSignal;
  /** Timeout in milliseconds before the session is aborted. */
  timeoutMs: number;
  /**
   * Event handler. Receives each session event and the lifecycle context.
   * Call `ctx.resolve(ctx.cleanup(result))` to settle the promise.
   */
  onEvent: (event: AgentSessionEvent, ctx: LifecycleCtx<TResult>) => void;
  /**
   * Custom timeout behavior. When omitted, the session is hard-aborted
   * and resolved with `timeoutResult`. When provided, the callback can
   * steer the session and schedule a hard abort, registering cleanup
   * via `ctx.addTeardown`.
   */
  onTimeout?: (ctx: LifecycleCtx<TResult>) => void;
  /** Factory for the result produced when the abort signal fires. */
  canceledResult: (ctx: LifecycleCtx<TResult>) => TResult;
  /** Factory for the result produced when `session.prompt()` throws. */
  failedResult: (reason: string, ctx: LifecycleCtx<TResult>) => TResult;
  /** Factory for the result produced when the timeout expires (default hard abort). */
  timeoutResult: (timeoutMs: number, ctx: LifecycleCtx<TResult>) => TResult;
}

/**
 * Manages the lifecycle of a child agent session: subscribes to events,
 * wires abort-signal handling, enforces a timeout, and provides idempotent
 * cleanup. The caller supplies an event handler and optional custom timeout
 * behavior via `onTimeout`.
 *
 * The returned promise resolves when:
 * - The event handler calls `ctx.resolve(ctx.cleanup(result))`
 * - The abort signal fires (resolves via `canceledResult(ctx)`)
 * - The timeout expires (resolves via `timeoutResult`, or `onTimeout` handles
 *   it by calling `ctx.resolve(ctx.cleanup(...))` itself)
 * - `session.prompt()` rejects (resolves via `failedResult`)
 */
export function runWithLifecycle<TResult>(
  config: RunWithLifecycleConfig<TResult>,
): Promise<TResult> {
  const {
    session,
    prompt,
    signal,
    timeoutMs,
    onEvent,
    onTimeout,
    canceledResult,
    failedResult,
    timeoutResult,
  } = config;

  const progress: ReviewProgress = {
    turns: 0,
    toolUses: 0,
    activities: [],
    tokens: undefined,
  };
  const state: { settled: boolean; aborting: boolean } = {
    settled: false,
    aborting: false,
  };
  const teardownFns: (() => void)[] = [];

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
    session.dispose();
    return result;
  };

  return new Promise<TResult>((resolve) => {
    const ctx: LifecycleCtx<TResult> = {
      resolve,
      cleanup,
      progress,
      state,
      session,
      addTeardown,
    };

    session.subscribe((event: AgentSessionEvent) => {
      onEvent(event, ctx);
    });

    // Abort signal handler
    const onAbort = () => {
      if (state.settled) return;
      state.aborting = true;
      void session
        .abort()
        .catch(() => {})
        .finally(() => {
          resolve(cleanup(canceledResult(ctx)));
        });
    };
    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
      addTeardown(() => signal.removeEventListener("abort", onAbort));
    }

    // Timeout handler
    const onTimeoutExpired = () => {
      if (state.settled) return;

      if (onTimeout) {
        onTimeout(ctx);
      } else {
        // Default: hard abort
        state.aborting = true;
        void session
          .abort()
          .catch(() => {})
          .finally(() => {
            resolve(cleanup(timeoutResult(timeoutMs, ctx)));
          });
      }
    };
    const timeoutId = setTimeout(onTimeoutExpired, timeoutMs);
    timeoutId.unref?.();
    addTeardown(() => clearTimeout(timeoutId));

    // Start the session
    session.prompt(prompt).catch((error: unknown) => {
      if (!state.settled) {
        resolve(cleanup(failedResult(error instanceof Error ? error.message : String(error), ctx)));
      }
    });
  });
}
