import {
  isSemanticInputEnrollmentError,
  type SemanticInputSynchronizationError,
} from "./client-semantic-input-errors.ts";

const MAX_REQUEST_ENROLLMENT_RETRIES = 1;

/** A request-level enrollment retry decision owned by one request attempt. */
export type RequestEnrollmentRetryDecision =
  | { readonly kind: "retry" }
  | { readonly kind: "stop"; readonly error: unknown };

/** Look up the current input change after a failed request revision. */
export type SemanticInputChangeLookup = (
  revision: number,
) => SemanticInputSynchronizationError | undefined;

/**
 * Keep one semantic or diagnostic request's enrollment retry policy cohesive.
 *
 * Synchronization passes have their own rejoin budget. This guard only owns
 * the request-level budget and the first failed revision used to classify
 * later changes.
 */
export class SemanticInputRequestRetryGuard {
  #requestRetries = 0;
  #firstFailedRevision: number | undefined;

  constructor(private readonly currentChangeSince: SemanticInputChangeLookup) {}

  /** Number of request-level retries permitted for this request so far. */
  get retryCount(): number {
    return this.#requestRetries;
  }

  /** Whether this request already used its one request-level retry. */
  get hasRetried(): boolean {
    return this.#requestRetries > 0;
  }

  /** Throw the current non-enrollment cause when it blocks a retry. */
  assertCurrent(): void {
    const blockingChange = this.#getBlockingChange();
    if (blockingChange) throw blockingChange;
  }

  /** Classify one failed attempt and decide whether it may be retried. */
  decide(error: unknown, inputRevision: number | undefined): RequestEnrollmentRetryDecision {
    if (!isSemanticInputEnrollmentError(error)) {
      return { kind: "stop", error };
    }

    if (this.#firstFailedRevision !== undefined) {
      const blockingChange = this.#getBlockingChange();
      if (blockingChange) return { kind: "stop", error: blockingChange };
    }
    if (inputRevision === undefined) return { kind: "stop", error };

    this.#firstFailedRevision ??= inputRevision;
    const blockingChange = this.#getBlockingChange();
    if (blockingChange) return { kind: "stop", error: blockingChange };
    if (this.#requestRetries >= MAX_REQUEST_ENROLLMENT_RETRIES) {
      return { kind: "stop", error };
    }

    this.#requestRetries++;
    return { kind: "retry" };
  }

  #getBlockingChange(): SemanticInputSynchronizationError | undefined {
    if (this.#firstFailedRevision === undefined) return undefined;
    const currentChange = this.currentChangeSince(this.#firstFailedRevision);
    return currentChange?.changeKind === "enrollment" ? undefined : currentChange;
  }
}
