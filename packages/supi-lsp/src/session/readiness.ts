const DEFAULT_SEMANTIC_READY_TIMEOUT_MS = 15_000;

export type ReadinessValueResult<T> =
  | { kind: "resolved"; value: T }
  | { kind: "timeout" }
  | { kind: "unavailable"; reason: string };

/** Await one readiness operation while preserving its concrete success value. */
export async function raceReadinessValue<T>(
  readiness: Promise<T>,
  timeoutMs: number | undefined,
): Promise<ReadinessValueResult<T>> {
  const effectiveTimeoutMs = timeoutMs ?? DEFAULT_SEMANTIC_READY_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    const value = await Promise.race([
      readiness,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("semantic-readiness-timeout")),
          effectiveTimeoutMs,
        );
      }),
    ]);
    return { kind: "resolved", value };
  } catch (error) {
    if (error instanceof Error && error.message === "semantic-readiness-timeout") {
      return { kind: "timeout" };
    }
    return {
      kind: "unavailable",
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
