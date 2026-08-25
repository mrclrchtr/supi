import {
  type CodeQueryResult,
  type CodeRequestControl,
  completedCodeQuery,
  isCodeRequestInterruption,
  partialCodeQuery,
  throwIfCodeRequestInterrupted,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import type { Diagnostic } from "../config/types.ts";
import { TENTATIVE_PUSH_UNAVAILABLE_REASON } from "../diagnostics/evidence.ts";
import {
  type DiagnosticSynchronization,
  incompleteDiagnosticResult,
  raceDiagnosticPull,
} from "./client-diagnostic-evidence.ts";
import type { DiagnosticObserver, DiagnosticPushWaitOutcome } from "./client-diagnostic-timing.ts";
import type { DiagnosticWaitRegistry } from "./client-diagnostic-waiters.ts";

interface FileDiagnosticCollectionOptions {
  readonly supportsPull: boolean;
  readonly syncStart: number;
  readonly maxWaitMs: number;
  readonly request: DiagnosticSynchronization;
  readonly cachedDiagnostics: Diagnostic[] | null;
  readonly observer: DiagnosticObserver;
  readonly waiters: DiagnosticWaitRegistry;
  readonly current: () => boolean;
  readonly freshPush: () => boolean;
  /** Receive time of a current tentative push that is already cached. */
  readonly currentPushReceivedAt: () => number | undefined;
  readonly diagnostics: () => Diagnostic[];
  readonly pullDiagnostics: (timeoutMs: number, signal: AbortSignal) => Promise<boolean>;
  /** Observe the push wait outcome without finishing the observer; the caller finishes once. */
  readonly onPushWait?: (outcome: DiagnosticPushWaitOutcome) => void;
}

type PullCollectionOutcome = "failed" | "pull" | "push" | "released";

/** Collect fresh pull or push evidence for one synchronized document. */
export async function collectSynchronizedFileDiagnostics(
  options: FileDiagnosticCollectionOptions,
  control?: CodeRequestControl,
): Promise<CodeQueryResult<Diagnostic[]>> {
  throwIfCodeRequestInterrupted(control);
  if (options.supportsPull) {
    const pullOutcome = await collectPullEvidence(options, control);
    if (pullOutcome === "pull" || pullOutcome === "push") {
      return completedCodeQuery(options.diagnostics());
    }
  }

  throwIfCodeRequestInterrupted(control);
  if (!options.current()) {
    options.observer.pushWaitCompleted(1, "released");
    return unavailableCodeQuery(
      "Diagnostic collection ended before the current document synchronization was confirmed.",
    );
  }
  if (options.freshPush()) {
    options.observer.pushWaitCompleted(1, "published");
    return completedCodeQuery(options.diagnostics());
  }

  const push = await waitForConfirmedPush(options, control);
  if (options.onPushWait) options.onPushWait(push);
  else options.observer.pushWaitCompleted(1, push);
  if (push === "published") {
    return completedCodeQuery(options.diagnostics());
  }
  if (push === "tentative") {
    // A current tentative error is useful partial evidence, but an empty
    // publication cannot establish that the document is clean (ADR 0021).
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

/**
 * Wait until a confirmed push publication settles the synchronization.
 *
 * Every accepted publication releases the waiter. A confirmed push ends the
 * wait as "published". A publication that stays tentative (no republish
 * arrived for the same synchronization) ends as "tentative" when the budget
 * expires. A wait with no publication at all keeps the waiter's
 * "timed-out", and a lifecycle release stays "released".
 */
async function waitForConfirmedPush(
  options: FileDiagnosticCollectionOptions,
  control?: CodeRequestControl,
): Promise<DiagnosticPushWaitOutcome> {
  // A tentative publication may already sit in the cache when the wait
  // starts (ADR 0021). Do not grant repeated callers a new full wait window:
  // bound them by the first operation window or the cached publication age.
  const initialPushReceivedAt = options.currentPushReceivedAt();
  const waitDeadline = Math.min(
    options.syncStart + options.maxWaitMs,
    initialPushReceivedAt === undefined
      ? Number.POSITIVE_INFINITY
      : initialPushReceivedAt + options.maxWaitMs,
  );
  let observedPublication = initialPushReceivedAt !== undefined;
  for (;;) {
    throwIfCodeRequestInterrupted(control);
    // A republish can arrive after the previous wait released but before the
    // next waiter registers; re-check the store on every loop pass.
    if (options.freshPush()) return "published";
    const push = await options.waiters.waitForPush(
      options.request.uri,
      Math.max(0, waitDeadline - Date.now()),
      control,
    );
    // A lifecycle release ends the wait definitively: a tentative
    // publication observed earlier must not reclassify the release.
    if (push === "released") return "released";
    // A promotion can land while the timed-out waiter tears down; the cache
    // must complete the wait before the timeout classifies the outcome.
    if (options.freshPush()) return "published";
    if (push === "timed-out") {
      return observedPublication || options.currentPushReceivedAt() !== undefined
        ? "tentative"
        : "timed-out";
    }
    observedPublication = true;
  }
}

async function collectPullEvidence(
  options: FileDiagnosticCollectionOptions,
  control?: CodeRequestControl,
): Promise<PullCollectionOutcome> {
  const remaining = options.maxWaitMs - (Date.now() - options.syncStart);
  if (remaining <= 0) {
    options.observer.pullTimedOut();
    return "failed";
  }

  try {
    const controller = new AbortController();
    // Link the caller's cancellation to the local pull controller so an
    // in-flight pull receives protocol cancellation and stops promptly.
    const onAbort = () => controller.abort(control?.signal?.reason);
    if (control?.signal?.aborted) onAbort();
    else control?.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const outcome = await raceDiagnosticPull({
        pull: options.pullDiagnostics(remaining, controller.signal),
        waitForChange: () => options.waiters.waitForChange(),
        freshPush: options.freshPush,
        current: options.current,
      });
      if (outcome !== "pull") controller.abort();
      if (outcome === "pull") options.observer.pullCompleted(1);
      else options.observer.pullFailed(undefined);
      if (outcome === "push") options.observer.pushWaitCompleted(1, "published");
      return outcome;
    } finally {
      control?.signal?.removeEventListener("abort", onAbort);
    }
  } catch (error) {
    if (isCodeRequestInterruption(error, control)) throw error;
    options.observer.pullFailed(error);
    return "failed";
  }
}
