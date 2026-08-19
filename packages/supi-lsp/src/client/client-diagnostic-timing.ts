import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import { startDebugTimer } from "@mrclrchtr/supi-core/debug";
import { boundCwd, truncateIdentity } from "../debug-telemetry.ts";

type DiagnosticCollection = "cache" | "fallback" | "none" | "pull" | "push";
type DiagnosticFreshness = "not-observed" | "observed";
type DiagnosticOutcome = "completed" | "incomplete" | "skipped" | "timed-out";
type DiagnosticPullOutcome = "completed" | "failed" | "not-supported" | "not-used" | "timed-out";
type DiagnosticPushOutcome = "not-used" | "published" | "released" | "settled" | "timed-out";
type DiagnosticSettleOutcome = "not-used" | "published" | "quiet" | "released" | "timed-out";
type DiagnosticTimingOperation = "refresh-open" | "sync-file";

/** Result of waiting for a quiet push-diagnostic window. */
export interface DiagnosticSettleResult {
  readonly outcome: "quiet" | "released" | "timed-out";
  readonly freshness: DiagnosticFreshness;
}

/** Result of waiting for one file's push diagnostics. */
export type DiagnosticPushWaitOutcome = "published" | "released" | "timed-out";

interface DiagnosticTimingData {
  readonly collection: DiagnosticCollection;
  readonly documentCount: number;
  readonly fallback: boolean;
  readonly freshness: DiagnosticFreshness;
  readonly outcome: DiagnosticOutcome;
  readonly pull: DiagnosticPullOutcome;
  readonly push: DiagnosticPushOutcome;
  readonly reopen: number;
  readonly settle: DiagnosticSettleOutcome;
  readonly timedOut: boolean;
}

/** Internal pull failure that retains timeout state and failed document URIs. */
export class DiagnosticPullError extends Error {
  constructor(
    readonly timedOut: boolean,
    readonly failedUris: readonly string[] = [],
  ) {
    super("pull diagnostics incomplete");
  }
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
  #reopened = 0;

  constructor(
    readonly operation: DiagnosticTimingOperation,
    readonly supportsPull: boolean,
    readonly control?: CodeRequestControl,
    readonly identity?: DiagnosticTimingIdentity,
  ) {
    this.#pull = supportsPull ? "failed" : "not-supported";
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
      reopen: 0,
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
      reopen: 0,
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
        reopen: 0,
        settle: "not-used",
        timedOut: false,
      },
      "pull",
    );
  }

  pullFailed(error: unknown): void {
    this.#pull = isDiagnosticTimeout(error) ? "timed-out" : "failed";
    this.#timer.mark("pull");
  }

  pullTimedOut(): void {
    this.#pull = "timed-out";
    this.#timer.mark("pull");
  }

  /**
   * Record that the reopen-resync fallback re-opened unconfirmed documents.
   *
   * The mark fires when the second settle window starts, so the measured
   * phase is the preceding first settle window, not the reopen work.
   */
  reopened(count: number): void {
    this.#reopened += count;
    this.#timer.mark("first-settle");
  }

  pushSettled(documentCount: number, settle: DiagnosticSettleResult): void {
    const timedOut = settle.outcome === "timed-out";
    const completed = settle.outcome === "quiet" && settle.freshness === "observed";
    this.#finish(
      {
        collection: this.supportsPull ? "fallback" : "push",
        documentCount,
        fallback: this.supportsPull,
        freshness: settle.freshness,
        outcome: completed ? "completed" : timedOut ? "timed-out" : "incomplete",
        pull: this.#pull,
        push: timedOut ? "timed-out" : settle.outcome === "released" ? "released" : "settled",
        reopen: this.#reopened,
        settle: settle.outcome,
        timedOut: timedOut || this.#pull === "timed-out",
      },
      "push-settle",
    );
  }

  pushWaitCompleted(documentCount: number, push: DiagnosticPushWaitOutcome): void {
    const timedOut = push === "timed-out";
    this.#finish(
      {
        collection: this.supportsPull ? "fallback" : "push",
        documentCount,
        fallback: this.supportsPull,
        freshness: push === "published" ? "observed" : "not-observed",
        outcome: push === "published" ? "completed" : timedOut ? "timed-out" : "incomplete",
        pull: this.#pull,
        push,
        reopen: this.#reopened,
        settle: push,
        timedOut: timedOut || this.#pull === "timed-out",
      },
      "push-settle",
    );
  }

  #finish(data: DiagnosticTimingData, finalPhase?: "pull" | "push-settle" | "synchronize"): void {
    const { reopen, ...observation } = data;
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
          ...observation,
          // Reopen fallback usage is recorded only when it happened; the
          // default event shape stays stable for consumers of #322 telemetry.
          ...(reopen > 0 ? { reopen } : {}),
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
  if (error instanceof DiagnosticPullError) return error.timedOut;
  return error instanceof Error && /\btimed? ?out\b|\btimeout\b/i.test(error.message);
}
