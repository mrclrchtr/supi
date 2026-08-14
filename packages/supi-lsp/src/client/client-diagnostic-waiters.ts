import {
  type CodeRequestControl,
  CodeRequestDeadlineError,
  throwIfCodeRequestInterrupted,
} from "@mrclrchtr/supi-code-runtime/api";
import type {
  DiagnosticPushWaitOutcome,
  DiagnosticSettleResult,
} from "./client-diagnostic-timing.ts";

type DiagnosticWaiter = (outcome: "published" | "released") => void;

/** One cancellable wait for diagnostic state change. */
export interface DiagnosticStateWait {
  readonly promise: Promise<void>;
  cancel(): void;
}

interface DiagnosticSettleOptions {
  readonly syncStart: number;
  readonly maxWaitMs: number;
  readonly quietMs: number;
  readonly settleEpoch: number;
  readonly isComplete: () => boolean;
  readonly latestReceived: () => number;
}

/** Own diagnostic waiters and their timers for one LSP client. */
export class DiagnosticWaitRegistry {
  readonly #pushWaiters = new Map<string, DiagnosticWaiter[]>();
  readonly #stateWaiters = new Set<() => void>();
  readonly #settleWaiters = new Set<() => void>();
  #settleEpoch = 0;

  get settleEpoch(): number {
    return this.#settleEpoch;
  }

  /** Wait for a diagnostic publication or a lifecycle release for one URI. */
  waitForPush(
    uri: string,
    timeoutMs: number,
    control?: CodeRequestControl,
  ): Promise<DiagnosticPushWaitOutcome> {
    const deadlineRemaining =
      control?.deadline === undefined ? undefined : control.deadline - Date.now();
    const bindMs =
      deadlineRemaining === undefined ? timeoutMs : Math.min(timeoutMs, deadlineRemaining);
    if (control?.signal?.aborted) {
      return Promise.reject(control.signal.reason ?? new Error("Diagnostic push wait cancelled"));
    }
    if (bindMs <= 0) {
      if (deadlineRemaining !== undefined && deadlineRemaining < timeoutMs) {
        return Promise.reject(new CodeRequestDeadlineError());
      }
      return Promise.resolve("timed-out");
    }

    return new Promise<DiagnosticPushWaitOutcome>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        if (abortHandler) control?.signal?.removeEventListener("abort", abortHandler);
      };
      const waiter: DiagnosticWaiter = (outcome) => {
        cleanup();
        this.#removePushWaiter(uri, waiter);
        resolve(outcome);
      };
      const timer = setTimeout(() => {
        this.#removePushWaiter(uri, waiter);
        cleanup();
        if (deadlineRemaining !== undefined && deadlineRemaining < timeoutMs) {
          reject(new CodeRequestDeadlineError());
        } else {
          resolve("timed-out");
        }
      }, bindMs);
      let abortHandler: (() => void) | undefined;
      abortHandler = () => {
        cleanup();
        this.#removePushWaiter(uri, waiter);
        reject(control?.signal?.reason ?? new Error("Diagnostic push wait cancelled"));
      };
      if (control?.signal?.aborted) abortHandler();
      else control?.signal?.addEventListener("abort", abortHandler, { once: true });
      const waiters = this.#pushWaiters.get(uri) ?? [];
      waiters.push(waiter);
      this.#pushWaiters.set(uri, waiters);
    });
  }

  /** Wait until any diagnostic or lifecycle state changes. */
  waitForChange(): DiagnosticStateWait {
    let finish = () => {};
    const promise = new Promise<void>((resolve) => {
      finish = () => {
        this.#stateWaiters.delete(finish);
        resolve();
      };
      this.#stateWaiters.add(finish);
    });
    return { promise, cancel: finish };
  }

  /** Release pending push waiters for one URI. */
  releaseFile(uri: string, outcome: "published" | "released" = "released"): void {
    const waiters = this.#pushWaiters.get(uri);
    if (waiters) {
      this.#pushWaiters.delete(uri);
      for (const waiter of waiters) waiter(outcome);
    }
    this.#notifyStateWaiters();
  }

  /** Release all pending push waiters. */
  releaseAll(): void {
    for (const uri of Array.from(this.#pushWaiters.keys())) this.releaseFile(uri);
  }

  /** Cancel the active settle generation and release its timers. */
  cancelSettle(): void {
    this.#settleEpoch++;
    this.notifySettle();
  }

  /** Notify settle operations that diagnostic state changed. */
  notifySettle(): void {
    for (const release of Array.from(this.#settleWaiters)) release();
    this.#notifyStateWaiters();
  }

  /** Wait for fresh diagnostic state to become quiet or reach its deadline. */
  async waitForSettle(
    options: DiagnosticSettleOptions,
    control?: CodeRequestControl,
  ): Promise<DiagnosticSettleResult> {
    const { syncStart, maxWaitMs, quietMs, settleEpoch, isComplete, latestReceived } = options;
    const deadlineRemaining =
      control?.deadline === undefined ? undefined : control.deadline - Date.now();
    const deadline =
      deadlineRemaining === undefined
        ? syncStart + maxWaitMs
        : Math.min(syncStart + maxWaitMs, control?.deadline ?? syncStart + maxWaitMs);
    while (Date.now() < deadline) {
      throwIfCodeRequestInterrupted(control);
      if (this.#settleEpoch !== settleEpoch) {
        return { outcome: "released", freshness: "not-observed" };
      }
      const observedAt = latestReceived();
      const elapsed = Date.now() - observedAt;
      const complete = isComplete();
      if (observedAt > 0 && complete && elapsed >= quietMs) {
        return { outcome: "quiet", freshness: "observed" };
      }
      const waitMs =
        observedAt > 0 && complete
          ? Math.min(quietMs - elapsed, deadline - Date.now())
          : deadline - Date.now();
      await this.#waitForStateChange(waitMs, control);
    }
    // A bound absolute deadline makes the settle outcome a deadline
    // interruption instead of an ordinary relative timeout.
    throwIfCodeRequestInterrupted(control);
    return {
      outcome: "timed-out",
      freshness: latestReceived() > 0 ? "observed" : "not-observed",
    };
  }

  /** Wait until diagnostic state changes or the timeout expires. */
  #waitForStateChange(timeoutMs: number, control?: CodeRequestControl): Promise<void> {
    if (timeoutMs <= 0) return Promise.resolve();
    if (control?.signal?.aborted) {
      return Promise.reject(control.signal.reason ?? new Error("Settle wait cancelled"));
    }
    return new Promise((resolve, reject) => {
      let abortHandler: (() => void) | undefined;
      const finish = () => {
        clearTimeout(timer);
        if (abortHandler) control?.signal?.removeEventListener("abort", abortHandler);
        this.#settleWaiters.delete(finish);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      abortHandler = () => {
        clearTimeout(timer);
        this.#settleWaiters.delete(finish);
        reject(control?.signal?.reason ?? new Error("Settle wait cancelled"));
      };
      control?.signal?.addEventListener("abort", abortHandler, { once: true });
      this.#settleWaiters.add(finish);
    });
  }

  #notifyStateWaiters(): void {
    for (const release of Array.from(this.#stateWaiters)) release();
  }

  #removePushWaiter(uri: string, waiter: DiagnosticWaiter): void {
    const waiters = this.#pushWaiters.get(uri);
    if (!waiters) return;
    const next = waiters.filter((entry) => entry !== waiter);
    if (next.length > 0) this.#pushWaiters.set(uri, next);
    else this.#pushWaiters.delete(uri);
  }
}
