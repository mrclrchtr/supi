export type ScheduleDeadline = (callback: () => void, delayMs: number) => () => void;

export interface DeadlineControl {
  readonly deadline: number;
  readonly now: () => number;
  readonly signal?: AbortSignal;
  readonly schedule?: ScheduleDeadline;
}

export type DeadlineOutcome<T> =
  | { readonly kind: "completed"; readonly value: T }
  | { readonly kind: "timeout" };

/**
 * Settle an asynchronous operation before a shared wall-clock deadline.
 *
 * The underlying operation may not support cancellation, so a late result is
 * ignored after the timeout or abort wins the race. Callers must keep any
 * operation-local mutation isolated until this function reports completion.
 */
export async function settleByDeadline<T>(
  operation: () => Promise<T>,
  control: DeadlineControl,
): Promise<DeadlineOutcome<T>> {
  control.signal?.throwIfAborted();
  const remainingMs = control.deadline - control.now();
  if (remainingMs <= 0) return { kind: "timeout" };

  return new Promise<DeadlineOutcome<T>>((resolve, reject) => {
    let settled = false;
    let cancelTimer: (() => void) | undefined;

    const cleanup = () => {
      cancelTimer?.();
      control.signal?.removeEventListener("abort", onAbort);
    };
    const complete = (outcome: DeadlineOutcome<T>) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(outcome);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      try {
        control.signal?.throwIfAborted();
      } catch (error) {
        fail(error);
      }
    };

    control.signal?.addEventListener("abort", onAbort, { once: true });
    if (control.signal?.aborted) {
      onAbort();
      return;
    }
    if (Number.isFinite(remainingMs)) {
      cancelTimer = (control.schedule ?? scheduleDeadline)(
        () => complete({ kind: "timeout" }),
        remainingMs,
      );
    }
    Promise.resolve()
      .then(operation)
      .then(
        (value) => {
          complete(
            control.now() >= control.deadline ? { kind: "timeout" } : { kind: "completed", value },
          );
        },
        (error: unknown) => fail(error),
      );
  });
}

const scheduleDeadline: ScheduleDeadline = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs);
  return () => clearTimeout(timer);
};
