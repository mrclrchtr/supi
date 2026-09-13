import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import {
  startDebugTimer,
  truncateDebugIdentity as truncateIdentity,
} from "@mrclrchtr/supi-core/debug";
import { boundCwd } from "../debug-telemetry.ts";

type DiagnosticCollection =
  | "cache"
  | "fallback"
  | "mixed"
  | "none"
  | "pull"
  | "push"
  | "typescript";
type DiagnosticFreshness = "not-observed" | "observed";
type DiagnosticOutcome = "completed" | "incomplete" | "skipped" | "timed-out";
type DiagnosticPullOutcome = "completed" | "failed" | "not-supported" | "not-used" | "timed-out";
type DiagnosticRequestSource = "pull" | "typescript" | "mixed";
type DiagnosticPushOutcome = "not-used" | "tentative" | "released" | "settled" | "timed-out";
type DiagnosticSettleOutcome = "not-used" | "quiet" | "released" | "timed-out";
type DiagnosticTimingOperation = "refresh-open" | "sync-file";

/** Result of waiting for a quiet push-diagnostic window. */
export interface DiagnosticSettleResult {
  readonly outcome: "quiet" | "released" | "timed-out";
  readonly freshness: DiagnosticFreshness;
}

/** Result of collecting one file's ambient push diagnostics. */
export type DiagnosticPushWaitOutcome = "tentative" | "released" | "timed-out";

/** Result of waiting for one ambient push observation. */
export type DiagnosticPushObservationOutcome = "observed" | "released" | "timed-out";

interface DiagnosticTimingData {
  readonly collection: DiagnosticCollection;
  readonly documentCount: number;
  readonly fallback: boolean;
  readonly freshness: DiagnosticFreshness;
  readonly outcome: DiagnosticOutcome;
  readonly pull: DiagnosticPullOutcome;
  readonly push: DiagnosticPushOutcome;
  readonly settle: DiagnosticSettleOutcome;
  readonly timedOut: boolean;
}

/** Bounded identity for one diagnostic timing observation. */
export interface DiagnosticTimingIdentity {
  /** Configured server name. */
  readonly server?: string;
  /** Absolute workspace root. */
  readonly cwd?: string;
  /** Workspace-relative file path; sync-file operations only. */
  readonly file?: string;
}

/**
 * Record one diagnostic operation without diagnostic text or document content.
 *
 * The observer owns result classification so diagnostic control flow does not
 * duplicate the event shape. Identity is bounded and workspace-relative.
 */
export class DiagnosticObserver {
  readonly #timer = startDebugTimer();
  #pull: "failed" | "not-supported" | "timed-out";
  #requestSource: DiagnosticRequestSource | undefined;
  #request: "failed" | "timed-out" | undefined;

  constructor(
    readonly operation: DiagnosticTimingOperation,
    readonly hasDiagnosticRequestAdapter: boolean,
    readonly control?: CodeRequestControl,
    readonly identity?: DiagnosticTimingIdentity,
  ) {
    this.#pull = hasDiagnosticRequestAdapter ? "failed" : "not-supported";
  }

  synchronized(): void {
    this.#timer.mark("synchronize");
  }

  skipped(documentCount: number): void {
    this.#finish({
      collection: "none",
      documentCount,
      fallback: false,
      freshness: "not-observed",
      outcome: "skipped",
      pull: "not-used",
      push: "not-used",
      settle: "not-used",
      timedOut: false,
    });
  }

  cacheReused(documentCount: number): void {
    this.#finish({
      collection: "cache",
      documentCount,
      fallback: false,
      freshness: "observed",
      outcome: "completed",
      pull: "not-used",
      push: "not-used",
      settle: "not-used",
      timedOut: false,
    });
  }

  pullCompleted(documentCount: number): void {
    this.#finish(
      {
        collection: "pull",
        documentCount,
        fallback: false,
        freshness: "observed",
        outcome: "completed",
        pull: "completed",
        push: "not-used",
        settle: "not-used",
        timedOut: false,
      },
      "pull",
    );
  }

  /** Record a completed request-based collection. */
  requestCompleted(source: DiagnosticRequestSource, documentCount: number, finish = true): void {
    this.#requestSource = source;
    this.#request = undefined;
    if (source === "pull" && finish) {
      this.pullCompleted(documentCount);
      return;
    }
    if (!finish) {
      this.#timer.mark("request");
      return;
    }
    this.#finish(
      {
        collection: source === "typescript" ? "typescript" : "mixed",
        documentCount,
        fallback: false,
        freshness: "observed",
        outcome: "completed",
        pull: this.hasDiagnosticRequestAdapter ? "not-used" : "not-supported",
        push: "not-used",
        settle: "not-used",
        timedOut: false,
      },
      "request",
    );
  }

  /** Record a request failure without finishing the operation yet. */
  requestFailed(source: DiagnosticRequestSource | undefined, error: unknown): void {
    this.#requestSource = source;
    this.#request = isDiagnosticTimeout(error) ? "timed-out" : "failed";
    this.#timer.mark("request");
  }

  /** Finish an incomplete request collection without using push confirmation. */
  requestIncomplete(
    source: DiagnosticRequestSource | undefined,
    timedOut = false,
    documentCount = 1,
    finish = true,
  ): void {
    const requestSource = source ?? this.#requestSource ?? "pull";
    this.#requestSource = requestSource;
    this.#request = timedOut || this.#request === "timed-out" ? "timed-out" : "failed";
    if (!finish) {
      this.#timer.mark("request");
      return;
    }
    this.#finish(
      {
        collection: requestSource === "typescript" ? "typescript" : requestSource,
        documentCount,
        fallback: false,
        freshness: "not-observed",
        outcome: this.#request === "timed-out" ? "timed-out" : "incomplete",
        pull: requestSource === "pull" ? this.#request : "not-supported",
        push: "not-used",
        settle: "not-used",
        timedOut: this.#request === "timed-out",
      },
      "request",
    );
  }

  /** Finish a mixed request and push observation pass. */
  mixedSettled(
    source: DiagnosticRequestSource,
    documentCount: number,
    settle: DiagnosticSettleResult,
  ): void {
    const timedOut = settle.outcome === "timed-out" || this.#request === "timed-out";
    const requestOutcome =
      this.#request === "timed-out"
        ? ("timed-out" as const)
        : this.#request === "failed"
          ? ("failed" as const)
          : ("completed" as const);
    this.#finish(
      {
        collection: "mixed",
        documentCount,
        fallback: false,
        freshness: settle.freshness,
        outcome: timedOut ? "timed-out" : "incomplete",
        pull: source === "pull" ? requestOutcome : "not-supported",
        push: timedOut ? "timed-out" : settle.outcome === "released" ? "released" : "settled",
        settle: settle.outcome,
        timedOut,
      },
      "push-settle",
    );
  }

  /** Record a request that could not start within its collection budget. */
  requestTimedOut(source: DiagnosticRequestSource | undefined): void {
    this.#requestSource = source;
    this.#request = "timed-out";
    this.#timer.mark("request");
    this.requestIncomplete(source, true);
  }

  pushSettled(documentCount: number, settle: DiagnosticSettleResult): void {
    const timedOut = settle.outcome === "timed-out";
    this.#finish(
      {
        collection: this.hasDiagnosticRequestAdapter ? "fallback" : "push",
        documentCount,
        fallback: this.hasDiagnosticRequestAdapter,
        freshness: settle.freshness,
        outcome: timedOut ? "timed-out" : "incomplete",
        pull: this.#pull,
        push: timedOut ? "timed-out" : settle.outcome === "released" ? "released" : "settled",
        settle: settle.outcome,
        timedOut: timedOut || this.#pull === "timed-out",
      },
      "push-settle",
    );
  }

  pushWaitCompleted(documentCount: number, push: DiagnosticPushWaitOutcome): void {
    const timedOut = push === "tentative" || push === "timed-out";
    const observed = push === "tentative";
    this.#finish(
      {
        collection: this.hasDiagnosticRequestAdapter ? "fallback" : "push",
        documentCount,
        fallback: this.hasDiagnosticRequestAdapter,
        freshness: observed ? "observed" : "not-observed",
        outcome: timedOut ? "timed-out" : "incomplete",
        pull: this.#pull,
        push,
        settle: timedOut ? "timed-out" : push,
        timedOut: timedOut || this.#pull === "timed-out",
      },
      "push-settle",
    );
  }

  #finish(
    data: DiagnosticTimingData,
    finalPhase?: "pull" | "push-settle" | "request" | "synchronize",
  ): void {
    this.#timer.finish(
      () => ({
        operationId: this.control?.operationId,
        source: "lsp",
        level: "debug",
        category: "diagnostics.timing",
        message: `LSP diagnostic ${this.operation} ${data.outcome}`,
        cwd: boundCwd(this.identity?.cwd),
        data: {
          operation: this.operation,
          ...data,
          ...(this.identity?.server !== undefined
            ? { server: truncateIdentity(this.identity.server) }
            : {}),
          ...(this.identity?.file !== undefined
            ? { file: truncateIdentity(this.identity.file) }
            : {}),
        },
      }),
      finalPhase,
    );
  }
}

/** Return whether a diagnostic failure represents a timeout without retaining its message. */
export function isDiagnosticTimeout(error: unknown): boolean {
  return error instanceof Error && /\btimed? ?out\b|\btimeout\b/i.test(error.message);
}
