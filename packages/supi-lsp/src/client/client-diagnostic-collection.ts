import {
  type CodeQueryResult,
  type CodeRequestControl,
  completedCodeQuery,
  isCodeRequestDeadlineError,
  partialCodeQuery,
  throwIfCodeRequestInterrupted,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import type { Diagnostic } from "../config/types.ts";
import { TENTATIVE_PUSH_UNAVAILABLE_REASON } from "../diagnostics/evidence.ts";
import { raceRequestControl } from "../session/readiness.ts";
import {
  type DiagnosticSynchronization,
  incompleteDiagnosticResult,
} from "./client-diagnostic-evidence.ts";
import {
  type DiagnosticRequestSource,
  isDiagnosticRequestInvalidated,
} from "./client-diagnostic-request.ts";
import {
  type DiagnosticObserver,
  type DiagnosticPushWaitOutcome,
  isDiagnosticTimeout,
} from "./client-diagnostic-timing.ts";
import type { DiagnosticWaitRegistry } from "./client-diagnostic-waiters.ts";

interface FileDiagnosticCollectionOptions {
  /** Request-based evidence takes priority over all ambient push waits. */
  readonly requestDiagnostics?: (
    timeoutMs: number,
    deadline: number,
    control?: CodeRequestControl,
  ) => Promise<boolean>;
  readonly requestSource?: DiagnosticRequestSource;
  readonly syncStart: number;
  readonly maxWaitMs: number;
  readonly request: DiagnosticSynchronization;
  readonly cachedDiagnostics: Diagnostic[] | null;
  readonly observer: DiagnosticObserver;
  readonly waiters: DiagnosticWaitRegistry;
  readonly current: () => boolean;
  /** Current ambient push observation for this synchronization, when present. */
  readonly currentPushObservation: () =>
    | { receivedAt: number; hasDiagnostics: boolean }
    | undefined;
  readonly diagnostics: () => Diagnostic[];
}

/** Collect fresh pull or push evidence for one synchronized document. */
export async function collectSynchronizedFileDiagnostics(
  options: FileDiagnosticCollectionOptions,
  control?: CodeRequestControl,
): Promise<CodeQueryResult<Diagnostic[]>> {
  throwIfCodeRequestInterrupted(control);
  return options.requestDiagnostics
    ? collectRequestBasedEvidence(options, control)
    : collectPushOnlyEvidence(options, control);
}

async function collectRequestBasedEvidence(
  options: FileDiagnosticCollectionOptions,
  control?: CodeRequestControl,
): Promise<CodeQueryResult<Diagnostic[]>> {
  const requestOutcome = await collectRequestEvidence(options, control);
  if (requestOutcome === "completed") return completedCodeQuery(options.diagnostics());
  if (requestOutcome === "released") {
    return incompleteDiagnosticResult(options.cachedDiagnostics, "released");
  }
  if (options.currentPushObservation()?.hasDiagnostics) {
    return partialCodeQuery(
      options.diagnostics(),
      "Fresh diagnostic requests failed; ambient diagnostics are partial evidence.",
    );
  }
  return incompleteDiagnosticResult(options.cachedDiagnostics, "timed-out");
}

async function collectPushOnlyEvidence(
  options: FileDiagnosticCollectionOptions,
  control?: CodeRequestControl,
): Promise<CodeQueryResult<Diagnostic[]>> {
  throwIfCodeRequestInterrupted(control);
  if (!options.current()) {
    options.observer.pushWaitCompleted(1, "released");
    return unavailableCodeQuery(
      "Diagnostic collection ended before the current document synchronization was confirmed.",
    );
  }
  const push = await waitForPushObservation(options, control);
  options.observer.pushWaitCompleted(1, push);
  if (push === "tentative") {
    const diagnostics = options.diagnostics();
    return diagnostics.length > 0
      ? partialCodeQuery(diagnostics, TENTATIVE_PUSH_UNAVAILABLE_REASON)
      : unavailableCodeQuery(TENTATIVE_PUSH_UNAVAILABLE_REASON);
  }
  return incompleteDiagnosticResult(
    options.cachedDiagnostics,
    push === "released" ? "released" : "timed-out",
  );
}

/** Collect one request report without using an ambient push as confirmation. */
async function collectRequestEvidence(
  options: FileDiagnosticCollectionOptions,
  control?: CodeRequestControl,
): Promise<"completed" | "failed" | "released"> {
  const deadline = Math.min(
    options.syncStart + options.maxWaitMs,
    control?.deadline ?? Number.POSITIVE_INFINITY,
  );
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    options.observer.requestTimedOut(options.requestSource);
    return "failed";
  }
  try {
    const requestDiagnostics = options.requestDiagnostics;
    if (!requestDiagnostics) return "released";
    const completed = await raceRequestControl(
      requestDiagnostics(remaining, deadline, control),
      control,
    );
    if (!completed) {
      options.observer.requestIncomplete(options.requestSource);
      return "released";
    }
    options.observer.requestCompleted(options.requestSource ?? "pull", 1);
    return "completed";
  } catch (error) {
    if (isDiagnosticRequestInvalidated(error)) {
      options.observer.requestIncomplete(options.requestSource);
      return "released";
    }
    if (
      control?.signal?.aborted ||
      (control?.deadline !== undefined && Date.now() >= control.deadline)
    ) {
      throw error;
    }
    const timedOut = isDiagnosticCollectionTimeout(error);
    options.observer.requestFailed(options.requestSource, error);
    options.observer.requestIncomplete(options.requestSource, timedOut);
    return "failed";
  }
}

function isDiagnosticCollectionTimeout(error: unknown): boolean {
  return isCodeRequestDeadlineError(error) || isDiagnosticTimeout(error);
}

/**
 * Wait for ambient push observations within the file collection budget.
 *
 * A publication is useful partial evidence, but it does not confirm a
 * synchronization. Continue to the budget so delayed publications can still
 * improve the partial result; a lifecycle release remains definitive.
 */
async function waitForPushObservation(
  options: FileDiagnosticCollectionOptions,
  control?: CodeRequestControl,
): Promise<DiagnosticPushWaitOutcome> {
  const initialObservation = options.currentPushObservation();
  const waitDeadline = Math.min(
    options.syncStart + options.maxWaitMs,
    initialObservation === undefined
      ? Number.POSITIVE_INFINITY
      : initialObservation.receivedAt + options.maxWaitMs,
  );
  let observedPublication = initialObservation !== undefined;
  for (;;) {
    throwIfCodeRequestInterrupted(control);
    const push = await options.waiters.waitForPush(
      options.request.uri,
      Math.max(0, waitDeadline - Date.now()),
      control,
    );
    if (push === "released") return "released";
    if (push === "timed-out") {
      return observedPublication || options.currentPushObservation() !== undefined
        ? "tentative"
        : "timed-out";
    }
    observedPublication = true;
  }
}
