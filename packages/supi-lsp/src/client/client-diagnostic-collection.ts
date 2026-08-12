import {
  type CodeQueryResult,
  completedCodeQuery,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import type { Diagnostic } from "../config/types.ts";
import {
  type DiagnosticSynchronization,
  incompleteDiagnosticResult,
  raceDiagnosticPull,
} from "./client-diagnostic-evidence.ts";
import type { DiagnosticObserver } from "./client-diagnostic-timing.ts";
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
  readonly diagnostics: () => Diagnostic[];
  readonly pullDiagnostics: (timeoutMs: number, signal: AbortSignal) => Promise<boolean>;
}

type PullCollectionOutcome = "failed" | "pull" | "push" | "released";

/** Collect fresh pull or push evidence for one synchronized document. */
export async function collectSynchronizedFileDiagnostics(
  options: FileDiagnosticCollectionOptions,
): Promise<CodeQueryResult<Diagnostic[]>> {
  if (options.supportsPull) {
    const pullOutcome = await collectPullEvidence(options);
    if (pullOutcome === "pull" || pullOutcome === "push") {
      return completedCodeQuery(options.diagnostics());
    }
  }

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

  const push = await options.waiters.waitForPush(
    options.request.uri,
    Math.max(0, options.maxWaitMs - (Date.now() - options.syncStart)),
  );
  options.observer.pushWaitCompleted(1, push);
  if (push === "published" && options.freshPush()) {
    return completedCodeQuery(options.diagnostics());
  }
  return incompleteDiagnosticResult(
    options.cachedDiagnostics,
    push === "released" ? "released" : "timed-out",
  );
}

async function collectPullEvidence(
  options: FileDiagnosticCollectionOptions,
): Promise<PullCollectionOutcome> {
  const remaining = options.maxWaitMs - (Date.now() - options.syncStart);
  if (remaining <= 0) {
    options.observer.pullTimedOut();
    return "failed";
  }

  try {
    const controller = new AbortController();
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
  } catch (error) {
    options.observer.pullFailed(error);
    return "failed";
  }
}
