import {
  type CodeRequestControl,
  CodeRequestDeadlineError,
  throwIfCodeRequestInterrupted,
} from "@mrclrchtr/supi-code-runtime/api";

const MAX_PENDING_INPUT_OPERATIONS = 32;

type InputOperationKind = "request" | "enrollment" | "request-enrollment";

interface PendingInputOperation {
  readonly uri: string | undefined;
  readonly kind: InputOperationKind;
  start(): void;
  cancel(reason: unknown): void;
}

/**
 * Admit first opens between semantic query and refactor-planning attempts on one client.
 * Consecutive readers run concurrently; FIFO admission prevents either new
 * readers or enrollments from overtaking a waiting operation. This is not
 * diagnostic transport ownership: an interrupted semantic attempt can release
 * its admission even when the server has not yet acknowledged cancellation.
 */
export class SemanticInputAdmission {
  readonly #pending: PendingInputOperation[] = [];
  #readers = 0;
  #enrolling = false;
  #disposed = false;

  /** Cover one attempt's synchronization, RPCs and acceptance, never its retry. */
  request<T>(run: () => Promise<T>, control?: CodeRequestControl, uri?: string): Promise<T> {
    return this.#run("request", uri, run, control);
  }

  /**
   * Commit a first open after earlier attempts leave. Demand with original
   * semantic/refactor parameters opts into input invalidation while waiting.
   */
  enroll(
    uri: string,
    run: () => void,
    control?: CodeRequestControl,
    protectInputs = false,
  ): Promise<void> {
    return this.#run(protectInputs ? "request-enrollment" : "enrollment", uri, run, control);
  }

  /** A close cancels queued opens and queries for that document, before dispatch. */
  close(uri: string): void {
    const cancelled = this.#pending.filter((pending) => pending.uri === uri);
    for (const pending of cancelled) this.#pending.splice(this.#pending.indexOf(pending), 1);
    for (const pending of cancelled)
      pending.cancel(new Error("Document closed before input admission."));
  }

  /** Discard queued request parameters after a known non-enrollment input change. */
  invalidateRequests(): void {
    const cancelled = this.#pending.filter((pending) => pending.kind !== "enrollment");
    for (const pending of cancelled) this.#pending.splice(this.#pending.indexOf(pending), 1);
    for (const pending of cancelled)
      pending.cancel(new Error("Semantic inputs changed before request admission."));
  }

  /** Reject queued work without confusing caller completion with transport settlement. */
  dispose(): void {
    this.#disposed = true;
    for (const pending of [...this.#pending]) {
      pending.cancel(new Error("LSP client stopped before input admission."));
    }
  }

  #run<T>(
    kind: InputOperationKind,
    uri: string | undefined,
    run: () => T | Promise<T>,
    control: CodeRequestControl | undefined,
  ): Promise<T> {
    throwIfCodeRequestInterrupted(control);
    if (this.#disposed) return Promise.reject(new Error("LSP input admission is disposed."));
    if (this.#pending.length >= MAX_PENDING_INPUT_OPERATIONS) {
      return Promise.reject(new Error("LSP input admission queue is full."));
    }
    return new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let waiting = true;
      const cleanup = () => {
        if (timer !== undefined) clearTimeout(timer);
        control?.signal?.removeEventListener("abort", abort);
      };
      const operation: PendingInputOperation = {
        uri,
        kind,
        cancel: (reason) => {
          if (!waiting) return;
          waiting = false;
          cleanup();
          const index = this.#pending.indexOf(operation);
          if (index !== -1) this.#pending.splice(index, 1);
          reject(reason);
          this.#drain();
        },
        start: () => {
          waiting = false;
          cleanup();
          if (kind !== "request") this.#enrolling = true;
          else this.#readers++;
          const finish = () => {
            if (kind !== "request") this.#enrolling = false;
            else this.#readers--;
            this.#drain();
          };
          try {
            throwIfCodeRequestInterrupted(control);
            Promise.resolve(run()).then(resolve, reject).finally(finish);
          } catch (error) {
            reject(error);
            finish();
          }
        },
      };
      const abort = () => {
        try {
          throwIfCodeRequestInterrupted(control);
        } catch (error) {
          operation.cancel(error);
        }
      };
      this.#pending.push(operation);
      control?.signal?.addEventListener("abort", abort, { once: true });
      if (control?.deadline !== undefined) {
        timer = setTimeout(
          () => operation.cancel(new CodeRequestDeadlineError()),
          Math.max(0, control.deadline - Date.now()),
        );
      }
      this.#drain();
    });
  }

  #drain(): void {
    while (!this.#disposed && !this.#enrolling && this.#pending.length > 0) {
      const next = this.#pending[0];
      if (next.kind !== "request" && this.#readers > 0) return;
      this.#pending.shift();
      next.start();
    }
  }
}
