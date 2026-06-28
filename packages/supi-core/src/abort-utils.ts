/**
 * Abort controller/signal utility helpers.
 *
 * @module
 */

/**
 * Combine a caller-provided abort controller with a generation timeout signal.
 *
 * Returns the combined signal and a cleanup function that removes both
 * event listeners. Callers must invoke cleanup in a `finally` block
 * to avoid listener leaks.
 */
export function combineAbortSignals(
  abort: AbortController,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combinedController = new AbortController();
  const onAbort = () => combinedController.abort();
  abort.signal.addEventListener("abort", onAbort, { once: true });
  timeoutSignal.addEventListener("abort", onAbort, { once: true });

  return {
    signal: combinedController.signal,
    cleanup: () => {
      abort.signal.removeEventListener("abort", onAbort);
      timeoutSignal.removeEventListener("abort", onAbort);
    },
  };
}
