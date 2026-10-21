import {
  isSemanticInputEnrollmentError,
  type SemanticInputSynchronizationError,
} from "./client-semantic-input-errors.ts";

const MAX_REQUEST_RETRIES = 1;
const CONTENT_MODIFIED_ERROR_CODE = -32_801;

/** Reason that permits one request retry. */
export type SemanticInputRequestRetryReason = "content-modified" | "enrollment";

/** A request-level retry decision owned by one attempt. */
export type SemanticInputRequestRetryDecision =
  | { readonly kind: "retry"; readonly reason: SemanticInputRequestRetryReason }
  | {
      readonly kind: "stop";
      readonly error: unknown;
      readonly reason?: SemanticInputRequestRetryReason;
    };

/** Look up the current input change after a failed request revision. */
export type SemanticInputChangeLookup = (
  revision: number,
) => SemanticInputSynchronizationError | undefined;

/** Optional request retry policies. ContentModified retries stay off by default. */
export interface SemanticInputRequestRetryPolicy {
  readonly retryContentModified?: boolean;
  /** Retain a verified revision across document enrollment and a follow-up request. */
  readonly inputRevision?: number;
}

function isContentModifiedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === CONTENT_MODIFIED_ERROR_CODE
  );
}

/**
 * Keep one LSP request's input retry policy in one place.
 *
 * Synchronization passes have their own rejoin budget. This guard owns one
 * shared request retry budget and a protected revision used to classify later
 * changes. A caller can retain an earlier verified revision across enrollment.
 * Protocol retries are disabled unless the caller opts in.
 */
export class SemanticInputRequestRetryGuard {
  #requestRetries = 0;
  #protectedRevision: number | undefined;
  #retryReason: SemanticInputRequestRetryReason | undefined;

  constructor(
    private readonly currentChangeSince: SemanticInputChangeLookup,
    private readonly policy: SemanticInputRequestRetryPolicy = {},
  ) {
    this.#protectedRevision = policy.inputRevision;
  }

  /** Number of request-level retries permitted for this request so far. */
  get retryCount(): number {
    return this.#requestRetries;
  }

  /** Whether this request already used its one request-level retry. */
  get hasRetried(): boolean {
    return this.#requestRetries > 0;
  }

  /** Cause of the retry already used by this request, if any. */
  get retryReason(): SemanticInputRequestRetryReason | undefined {
    return this.#retryReason;
  }

  /** Throw the current non-enrollment cause when it blocks a retry. */
  assertCurrent(): void {
    const blockingChange = this.#getBlockingChange();
    if (blockingChange) throw blockingChange;
  }

  /** Classify one failed attempt and decide whether it may be retried. */
  decide(error: unknown, inputRevision: number | undefined): SemanticInputRequestRetryDecision {
    const reason = this.#getRetryReason(error);
    if (!reason) return { kind: "stop", error };

    if (this.#protectedRevision !== undefined) {
      const blockingChange = this.#getBlockingChange();
      if (blockingChange) return { kind: "stop", error: blockingChange };
    }
    if (inputRevision === undefined) return { kind: "stop", error };

    this.#protectedRevision ??= inputRevision;
    const blockingChange = this.#getBlockingChange();
    if (blockingChange) return { kind: "stop", error: blockingChange };
    if (this.#requestRetries >= MAX_REQUEST_RETRIES) {
      return { kind: "stop", error, reason };
    }

    this.#requestRetries++;
    this.#retryReason ??= reason;
    return { kind: "retry", reason };
  }

  #getRetryReason(error: unknown): SemanticInputRequestRetryReason | undefined {
    if (isSemanticInputEnrollmentError(error)) return "enrollment";
    if (this.policy.retryContentModified && isContentModifiedError(error)) {
      return "content-modified";
    }
    return undefined;
  }

  #getBlockingChange(): SemanticInputSynchronizationError | undefined {
    if (this.#protectedRevision === undefined) return undefined;
    const currentChange = this.currentChangeSince(this.#protectedRevision);
    return currentChange?.changeKind === "enrollment" ? undefined : currentChange;
  }
}
