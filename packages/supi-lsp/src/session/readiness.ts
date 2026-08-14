import {
  type CodeRequestControl,
  CodeRequestDeadlineError,
  isCodeRequestInterruption,
  throwIfCodeRequestInterrupted,
} from "@mrclrchtr/supi-code-runtime/api";

const DEFAULT_SEMANTIC_READY_TIMEOUT_MS = 15_000;

export type ReadinessValueResult<T> =
  | { kind: "resolved"; value: T }
  | { kind: "timeout" }
  | { kind: "unavailable"; reason: string };

/**
 * Race one promise against request-control interruption (abort or absolute
 * deadline) and rethrow the interruption. The underlying promise keeps its
 * own lifecycle; only the caller's wait stops promptly.
 */
export async function raceRequestControl<T>(
  promise: Promise<T>,
  control?: CodeRequestControl,
): Promise<T> {
  if (!control) return promise;
  // Preflight: an already-cancelled caller stops even when the awaited
  // promise is already settled.
  throwIfCodeRequestInterrupted(control);
  const deadlineRemaining =
    control.deadline === undefined ? undefined : control.deadline - Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        if (deadlineRemaining !== undefined && deadlineRemaining <= 0) {
          reject(new CodeRequestDeadlineError());
          return;
        }
        if (deadlineRemaining !== undefined) {
          timer = setTimeout(() => reject(new CodeRequestDeadlineError()), deadlineRemaining);
        }
        abortHandler = () => reject(control.signal?.reason ?? new Error("Request cancelled"));
        if (control.signal?.aborted) abortHandler();
        else control.signal?.addEventListener("abort", abortHandler, { once: true });
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (abortHandler) control.signal?.removeEventListener("abort", abortHandler);
  }
}

/** Await one readiness operation while preserving its concrete success value. */
export async function raceReadinessValue<T>(
  readiness: Promise<T>,
  timeoutMs: number | undefined,
  control?: CodeRequestControl,
): Promise<ReadinessValueResult<T>> {
  // Preflight: an already-cancelled caller stops even when the readiness
  // promise is already settled.
  throwIfCodeRequestInterrupted(control);
  const effectiveTimeoutMs = timeoutMs ?? DEFAULT_SEMANTIC_READY_TIMEOUT_MS;
  const deadlineRemaining =
    control?.deadline === undefined ? undefined : control.deadline - Date.now();
  const bindMs =
    deadlineRemaining === undefined
      ? effectiveTimeoutMs
      : Math.min(effectiveTimeoutMs, deadlineRemaining);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let abortHandler: (() => void) | undefined;

  try {
    const value = await Promise.race([
      readiness,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              deadlineRemaining !== undefined && deadlineRemaining < effectiveTimeoutMs
                ? new CodeRequestDeadlineError()
                : new Error("semantic-readiness-timeout"),
            ),
          Math.max(0, bindMs),
        );
      }),
      new Promise<never>((_resolve, reject) => {
        abortHandler = () =>
          reject(control?.signal?.reason ?? new Error("Readiness wait cancelled"));
        if (control?.signal?.aborted) abortHandler();
        else control?.signal?.addEventListener("abort", abortHandler, { once: true });
      }),
    ]);
    return { kind: "resolved", value };
  } catch (error) {
    if (isCodeRequestInterruption(error, control)) throw error;
    if (error instanceof Error && error.message === "semantic-readiness-timeout") {
      return { kind: "timeout" };
    }
    return {
      kind: "unavailable",
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (abortHandler) control?.signal?.removeEventListener("abort", abortHandler);
  }
}
