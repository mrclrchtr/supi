import {
  type CodeRequestControl,
  throwIfCodeRequestInterrupted,
} from "@mrclrchtr/supi-code-runtime/api";
import type { DocumentDiagnosticReport } from "../config/types.ts";
import { raceRequestControl } from "../session/readiness.ts";

/** Evidence source used by an explicit diagnostic request. */
export type DiagnosticRequestSource = "pull" | "typescript";

/** Error used when local document or client invalidation supersedes a request. */
export class DiagnosticRequestInvalidatedError extends Error {
  constructor(message = "Diagnostic request was invalidated.") {
    super(message);
    // biome-ignore lint/security/noSecrets: This is a stable error class name.
    this.name = "DiagnosticRequestInvalidatedError";
  }
}

/** Test whether a request stopped because its local evidence generation ended. */
export function isDiagnosticRequestInvalidated(error: unknown): boolean {
  return error instanceof DiagnosticRequestInvalidatedError;
}

/** Sanitized ownership and transport control for one explicit diagnostic pull. */
export interface DiagnosticPullRequest {
  readonly uri: string;
  readonly previousResultId: string | undefined;
  readonly timeoutMs: number;
  /** Adapter cancellation stops adapter work, not the owned transport. */
  readonly signal?: AbortSignal;
  readonly operationId?: string;
}

/** Result returned by one request adapter. */
export interface DiagnosticRequestResult {
  readonly source: DiagnosticRequestSource;
  readonly report: DocumentDiagnosticReport;
}

/**
 * The result and transport lifetime of one adapter request are separate.
 * `result` may stop at a local deadline while `settled` waits for the
 * underlying protocol request. This prevents a replacement request from
 * entering the same server route too early.
 */
export interface DiagnosticRequestExecution<T> {
  readonly result: Promise<T>;
  readonly settled: Promise<void>;
}

/** Internal seam for one explicit, file-scoped diagnostic request. */
export interface DiagnosticRequestAdapter {
  /** Whether this adapter can collect the requested URI right now. */
  supports(uri: string): boolean;
  /** Return the source that will be used for a URI, when known. */
  sourceFor(uri: string): DiagnosticRequestSource | undefined;
  /** Start one request without transferring caller cancellation to transport. */
  collect(request: DiagnosticPullRequest): DiagnosticRequestExecution<DiagnosticRequestResult>;
}

/** Combine adapters in priority order. The first applicable adapter wins. */
export function createPriorityDiagnosticRequestAdapter(
  adapters: readonly DiagnosticRequestAdapter[],
): DiagnosticRequestAdapter {
  const find = (uri: string) => adapters.find((adapter) => adapter.supports(uri));
  return {
    supports: (uri) => find(uri) !== undefined,
    sourceFor: (uri) => find(uri)?.sourceFor(uri),
    collect: (request) => {
      const adapter = find(request.uri);
      if (!adapter) {
        const error = new Error("No diagnostic request adapter applies to this document.");
        return { result: Promise.reject(error), settled: Promise.resolve() };
      }
      return adapter.collect(request);
    },
  };
}

interface ScheduledDiagnosticRequest<T> {
  readonly key: string;
  readonly start: () => DiagnosticRequestExecution<T>;
  readonly result: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
  readonly settled: Promise<void>;
  readonly settle: () => void;
  consumers: number;
}

/**
 * Share duplicate file requests and serialize requests for one client route.
 * The queue is deliberately small: callers must not create an unbounded
 * server-side tsserver request backlog after a timeout.
 */
export class DiagnosticRequestScheduler {
  static readonly MAX_PENDING_REQUESTS = 32;

  readonly #jobs = new Map<string, ScheduledDiagnosticRequest<unknown>>();
  readonly #pending: Array<ScheduledDiagnosticRequest<unknown>> = [];
  #active: ScheduledDiagnosticRequest<unknown> | undefined;

  /** Start or join one request, while keeping the underlying job shared. */
  run<T>(
    key: string,
    start: () => DiagnosticRequestExecution<T>,
    control?: CodeRequestControl,
  ): Promise<T> {
    throwIfCodeRequestInterrupted(control);
    let job = this.#jobs.get(key) as ScheduledDiagnosticRequest<T> | undefined;
    if (!job) {
      if (this.#pending.length >= DiagnosticRequestScheduler.MAX_PENDING_REQUESTS) {
        return Promise.reject(new Error("Diagnostic request queue is full."));
      }
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const result = new Promise<T>((jobResolve, jobReject) => {
        resolve = jobResolve;
        reject = jobReject;
      });
      let settle!: () => void;
      const settled = new Promise<void>((resolveSettled) => {
        settle = resolveSettled;
      });
      job = {
        key,
        start,
        result,
        resolve,
        reject,
        settled,
        settle,
        consumers: 0,
      };
      this.#jobs.set(key, job as ScheduledDiagnosticRequest<unknown>);
      this.#pending.push(job as ScheduledDiagnosticRequest<unknown>);
      this.#pump();
    }
    const currentJob = job;
    currentJob.consumers++;
    const waiting = raceRequestControl(currentJob.result, control);
    void waiting
      .finally(() =>
        this.#releaseConsumer(currentJob as unknown as ScheduledDiagnosticRequest<unknown>),
      )
      .catch(() => {});
    return waiting;
  }

  /** Drop requests that have not reached the transport. Active work is kept. */
  clearPending(reason = new DiagnosticRequestInvalidatedError()): void {
    this.clearPendingWhere(() => true, reason);
  }

  /** Drop matching queued requests without disturbing other documents. */
  clearPendingWhere(
    predicate: (key: string) => boolean,
    reason = new DiagnosticRequestInvalidatedError(),
  ): void {
    const pending = this.#pending.filter((job) => predicate(job.key));
    for (const job of pending) {
      const index = this.#pending.indexOf(job);
      if (index >= 0) this.#pending.splice(index, 1);
      this.#jobs.delete(job.key);
      job.reject(reason);
      job.settle();
    }
  }

  #releaseConsumer(job: ScheduledDiagnosticRequest<unknown>): void {
    job.consumers = Math.max(0, job.consumers - 1);
    if (job.consumers > 0 || this.#active === job) return;
    const pendingIndex = this.#pending.indexOf(job);
    if (pendingIndex < 0) return;
    this.#pending.splice(pendingIndex, 1);
    this.#jobs.delete(job.key);
    job.reject(new Error("Diagnostic request had no remaining callers."));
    job.settle();
  }

  #pump(): void {
    if (this.#active !== undefined) return;
    const job = this.#pending.shift();
    if (!job) return;
    this.#active = job;
    let execution: DiagnosticRequestExecution<unknown>;
    try {
      execution = job.start();
    } catch (error) {
      job.reject(error);
      job.settle();
      this.#active = undefined;
      this.#jobs.delete(job.key);
      this.#pump();
      return;
    }
    execution.result.then(job.resolve, job.reject).catch(() => {});
    execution.settled
      .catch(() => {})
      .then(() => {
        if (this.#active !== job) return;
        this.#active = undefined;
        this.#jobs.delete(job.key);
        job.settle();
        this.#pump();
      });
  }
}
