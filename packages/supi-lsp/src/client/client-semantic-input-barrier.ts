import { readFile } from "node:fs/promises";
import {
  type CodeRequestControl,
  throwIfCodeRequestInterrupted,
} from "@mrclrchtr/supi-code-runtime/api";
import { raceRequestControl } from "../session/readiness.ts";
import { fingerprintDocumentContent } from "./client-document-state.ts";

const DEFAULT_MAX_CONCURRENT_READS = 16;

/** Immutable document facts captured before one input synchronization pass. */
export interface SemanticInputDocument {
  readonly uri: string;
  readonly filePath: string;
  readonly content: string;
  readonly contentFingerprint: string;
}

/** One open document update selected by the barrier after a full read. */
export interface SemanticInputUpdate {
  readonly document: SemanticInputDocument;
  readonly content: string;
}

/** Private owner callbacks used by the input barrier. */
export interface SemanticInputBarrierHost {
  isOperational(): boolean;
  getOpenDocuments(): readonly SemanticInputDocument[];
  applyDocumentUpdates(updates: readonly SemanticInputUpdate[]): void;
  closeMissingDocument(filePath: string): void;
  markUnreadableDocument(filePath: string): void;
}

/** Internal file-read seam. It is not part of the public runtime contract. */
export type SemanticInputFileReader = (filePath: string, signal: AbortSignal) => Promise<string>;

/** Optional read bound and test seam for one input barrier. */
export interface SemanticInputBarrierOptions {
  readonly maxConcurrentReads?: number;
  readonly readFile?: SemanticInputFileReader;
}

/** Revision token returned by one completed input synchronization pass. */
export interface SemanticInputSnapshot {
  readonly revision: number;
}

interface OpenDocumentRead {
  readonly document: SemanticInputDocument;
  readonly result:
    | { readonly kind: "content"; readonly content: string }
    | { readonly kind: "error"; readonly error: unknown };
}

interface SynchronizationPlan {
  readonly updates: SemanticInputUpdate[];
  readonly observedDiskFingerprints: Map<string, string | undefined>;
}

interface PendingSynchronization {
  readonly controller: AbortController;
  generation: number;
  readonly contentOverrides: Map<string, string>;
  promise: Promise<SemanticInputSnapshot>;
  consumers: number;
  abandoned: boolean;
  started: boolean;
  settled: boolean;
}

/**
 * Keep semantic and diagnostic requests on the latest full-content input.
 *
 * The barrier owns one shared asynchronous read pass. Caller controls race
 * only their own wait; the pass stops when no caller remains or its generation
 * changes. Full file contents, rather than metadata, establish freshness.
 */
export class SemanticInputBarrier {
  readonly #host: SemanticInputBarrierHost;
  readonly #maxConcurrentReads: number;
  readonly #readFile: SemanticInputFileReader;
  /** Last verified disk fingerprint for each URI; undefined means observed missing. */
  readonly #observedDiskFingerprints = new Map<string, string | undefined>();
  #revision = 0;
  #pending: PendingSynchronization | null = null;

  constructor(host: SemanticInputBarrierHost, options: SemanticInputBarrierOptions = {}) {
    this.#host = host;
    this.#maxConcurrentReads = Math.max(
      1,
      Math.floor(options.maxConcurrentReads ?? DEFAULT_MAX_CONCURRENT_READS),
    );
    this.#readFile = options.readFile ?? defaultReadFile;
  }

  /** Read and apply all open inputs, sharing work for one input generation. */
  async synchronize(
    control?: CodeRequestControl,
    contentOverrides?: ReadonlyMap<string, string>,
  ): Promise<SemanticInputSnapshot> {
    for (;;) {
      const pending = this.#pending;
      if (!pending) break;
      if (this.#canJoin(pending, contentOverrides)) {
        this.#mergeContentOverrides(pending, contentOverrides);
        return this.#waitForPending(pending, control);
      }

      // A conflicting generation or override cannot join the owner. Wait for
      // the owner's actual reader promises before trying a replacement. The
      // caller may stop waiting, but it must never make the route reusable.
      await this.#waitForOwnerSettlement(pending, control);
      throwIfCodeRequestInterrupted(control);
    }

    if (!this.#host.isOperational()) {
      throw new Error("Semantic input synchronization is unavailable because the client stopped.");
    }

    const pending: PendingSynchronization = {
      controller: new AbortController(),
      generation: this.#revision,
      contentOverrides: new Map(contentOverrides),
      promise: undefined as unknown as Promise<SemanticInputSnapshot>,
      consumers: 0,
      abandoned: false,
      started: false,
      settled: false,
    };
    this.#pending = pending;
    // Store and pass the same owner object. Its mutable lifecycle fields must
    // not diverge between the runner, waiters, and settlement callback.
    pending.promise = this.#run(pending);
    void pending.promise.finally(() => this.#finish(pending)).catch(() => {});
    return this.#waitForPending(pending, control);
  }

  /** Recheck the full input set after a semantic request completes. */
  async assertCurrent(
    snapshot: SemanticInputSnapshot,
    control?: CodeRequestControl,
    contentOverrides?: ReadonlyMap<string, string>,
  ): Promise<void> {
    if (!this.#host.isOperational()) {
      throw new Error("Semantic input synchronization is unavailable because the client stopped.");
    }
    if (this.#revision !== snapshot.revision) {
      throw new Error("Semantic input changed while the request was running.");
    }
    const current = await this.synchronize(control, contentOverrides);
    if (current.revision !== snapshot.revision) {
      throw new Error("Semantic input changed while the request was running.");
    }
  }

  /** Record a lifecycle or input change that invalidates a pending pass. */
  noteInputChange(): void {
    this.#revision++;
    const pending = this.#pending;
    if (!pending || pending.settled) return;
    pending.controller.abort(
      new Error("Semantic input changed while synchronization was running."),
    );
  }

  /** Seed the initial disk baseline from the content used to open a document. */
  initializeDocumentContent(uri: string, content: string): void {
    this.#observedDiskFingerprints.set(uri, fingerprintDocumentContent(content));
  }

  /** Record content read from disk after a synchronization or refresh pass. */
  observeDiskContent(uri: string, content: string): void {
    this.#observedDiskFingerprints.set(uri, fingerprintDocumentContent(content));
  }

  /** Forget a document's last observed disk content. */
  forgetDocumentContent(uri: string): void {
    this.#observedDiskFingerprints.delete(uri);
  }

  /** Stop pending work and discard observed input fingerprints. */
  clear(): void {
    this.#observedDiskFingerprints.clear();
    this.noteInputChange();
  }

  #canJoin(
    pending: PendingSynchronization,
    contentOverrides: ReadonlyMap<string, string> | undefined,
  ): boolean {
    return (
      !pending.settled &&
      !pending.abandoned &&
      pending.generation === this.#revision &&
      this.#canMergeContentOverrides(pending, contentOverrides)
    );
  }

  #canMergeContentOverrides(
    pending: PendingSynchronization,
    contentOverrides: ReadonlyMap<string, string> | undefined,
  ): boolean {
    if (!contentOverrides) return true;
    for (const [uri, content] of contentOverrides) {
      const existing = pending.contentOverrides.get(uri);
      if (pending.started && existing === undefined) return false;
      if (existing !== undefined && existing !== content) return false;
    }
    return true;
  }

  #mergeContentOverrides(
    pending: PendingSynchronization,
    contentOverrides: ReadonlyMap<string, string> | undefined,
  ): void {
    if (!contentOverrides) return;
    for (const [uri, content] of contentOverrides) pending.contentOverrides.set(uri, content);
  }

  #waitForPending(
    pending: PendingSynchronization,
    control?: CodeRequestControl,
  ): Promise<SemanticInputSnapshot> {
    pending.consumers++;
    const waiting = raceRequestControl(pending.promise, control);
    void waiting.finally(() => this.#release(pending)).catch(() => {});
    return waiting;
  }

  async #waitForOwnerSettlement(
    pending: PendingSynchronization,
    control?: CodeRequestControl,
  ): Promise<void> {
    try {
      await raceRequestControl(pending.promise, control);
    } catch {
      // A failed or abandoned owner can be replaced after its readers settle.
      // Only this caller's interruption must escape this wait.
      throwIfCodeRequestInterrupted(control);
    }
    throwIfCodeRequestInterrupted(control);
  }

  #release(pending: PendingSynchronization): void {
    pending.consumers = Math.max(0, pending.consumers - 1);
    if (pending.consumers !== 0 || pending.settled) return;
    pending.abandoned = true;
    pending.controller.abort(new Error("Semantic input synchronization was abandoned."));
  }

  async #run(pending: PendingSynchronization): Promise<SemanticInputSnapshot> {
    pending.started = true;
    this.#assertPendingCanRun(pending);
    const documents = this.#host.getOpenDocuments();
    const reads = await this.#readOpenDocuments(documents, pending.controller.signal);
    this.#assertPendingCurrent(pending);
    const plan = this.#buildSynchronizationPlan(pending, reads);
    this.#assertPendingCurrent(pending);
    this.#applySynchronizationPlan(plan);
    if (!this.#host.isOperational()) {
      throw new Error("Semantic input synchronization is unavailable because the client stopped.");
    }
    // The revision can advance when this pass applies changed text. Mark that
    // resulting generation as owned by this completed pass so a late caller
    // can join it instead of starting a redundant read pass.
    pending.generation = this.#revision;
    return { revision: this.#revision };
  }

  #assertPendingCanRun(pending: PendingSynchronization): void {
    if (pending.controller.signal.aborted) throw pending.controller.signal.reason;
    if (!this.#host.isOperational()) {
      throw new Error("Semantic input synchronization is unavailable because the client stopped.");
    }
  }

  #assertPendingCurrent(pending: PendingSynchronization): void {
    if (pending.controller.signal.aborted) throw pending.controller.signal.reason;
    if (!this.#host.isOperational() || this.#revision !== pending.generation) {
      throw new Error("Semantic input changed while synchronization was running.");
    }
  }

  #buildSynchronizationPlan(
    pending: PendingSynchronization,
    reads: readonly OpenDocumentRead[],
  ): SynchronizationPlan {
    const updates: SemanticInputUpdate[] = [];
    const observedDiskFingerprints = new Map<string, string | undefined>();
    for (const read of reads) {
      const planned = this.#planDocumentRead(pending, read);
      observedDiskFingerprints.set(read.document.uri, planned.observedDiskFingerprint);
      if (planned.update) updates.push(planned.update);
    }
    return { updates, observedDiskFingerprints };
  }

  #planDocumentRead(
    pending: PendingSynchronization,
    read: OpenDocumentRead,
  ): { observedDiskFingerprint: string | undefined; update?: SemanticInputUpdate } {
    const override = pending.contentOverrides.get(read.document.uri);
    if (read.result.kind === "error") {
      return this.#planReadError(read.document, read.result.error, override);
    }

    const diskFingerprint = fingerprintDocumentContent(read.result.content);
    const hasObservedDiskContent = this.#observedDiskFingerprints.has(read.document.uri);
    const previousDiskFingerprint = this.#observedDiskFingerprints.get(read.document.uri);
    // An explicit override controls server content; the disk fingerprint remains the next observation.
    const content =
      override ??
      (hasObservedDiskContent && previousDiskFingerprint === diskFingerprint
        ? read.document.content
        : read.result.content);
    const contentFingerprint = fingerprintDocumentContent(content);
    return {
      observedDiskFingerprint: diskFingerprint,
      ...(read.document.contentFingerprint !== contentFingerprint
        ? { update: { document: read.document, content } }
        : {}),
    };
  }

  #planReadError(
    document: SemanticInputDocument,
    error: unknown,
    override: string | undefined,
  ): { observedDiskFingerprint: string | undefined; update?: SemanticInputUpdate } {
    if (override !== undefined && isMissingFileReadError(error)) {
      return {
        observedDiskFingerprint: undefined,
        ...(document.contentFingerprint !== fingerprintDocumentContent(override)
          ? { update: { document, content: override } }
          : {}),
      };
    }
    if (isMissingFileReadError(error)) {
      this.#host.closeMissingDocument(document.filePath);
      throw new Error(`Semantic input file was removed: ${document.filePath}`);
    }
    this.#host.markUnreadableDocument(document.filePath);
    throw new Error(`Semantic input file could not be read: ${document.filePath}`);
  }

  #applySynchronizationPlan(plan: SynchronizationPlan): void {
    if (plan.updates.length > 0) {
      this.#host.applyDocumentUpdates(plan.updates);
      this.#revision++;
    }
    this.#rememberObservedDiskFingerprints(plan.observedDiskFingerprints);
  }

  #rememberObservedDiskFingerprints(fingerprints: ReadonlyMap<string, string | undefined>): void {
    for (const [uri, fingerprint] of fingerprints) {
      this.#observedDiskFingerprints.set(uri, fingerprint);
    }
  }

  async #readOpenDocuments(
    documents: readonly SemanticInputDocument[],
    signal: AbortSignal,
  ): Promise<OpenDocumentRead[]> {
    const reads = new Array<OpenDocumentRead>(documents.length);
    let nextIndex = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        // An abandoned pass may have readers that ignore AbortSignal. Do not
        // dispatch another unread file after the owner has been abandoned.
        if (signal.aborted) return;
        const index = nextIndex++;
        const document = documents[index];
        if (!document) return;
        try {
          const content = await this.#readFile(document.filePath, signal);
          reads[index] = { document, result: { kind: "content", content } };
        } catch (error) {
          reads[index] = { document, result: { kind: "error", error } };
        }
      }
    };
    const workerCount = Math.min(this.#maxConcurrentReads, documents.length);
    const workers = await Promise.allSettled(Array.from({ length: workerCount }, () => worker()));
    const failure = workers.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure) throw failure.reason;
    return reads.filter((read): read is OpenDocumentRead => read !== undefined);
  }

  #finish(pending: PendingSynchronization): void {
    pending.settled = true;
    if (this.#pending === pending) this.#pending = null;
  }
}

async function defaultReadFile(filePath: string, signal: AbortSignal): Promise<string> {
  return readFile(filePath, { encoding: "utf8", signal });
}

function isMissingFileReadError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = error.code;
  return code === "ENOENT" || code === "ENOTDIR";
}
