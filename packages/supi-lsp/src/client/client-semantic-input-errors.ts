/** Input change that can supersede a synchronization pass or semantic result. */
export type SemanticInputChangeKind = "enrollment" | "content" | "close" | "failure" | "lifecycle";

/** Typed cause when a synchronization pass or semantic result sees a newer input generation. */
export class SemanticInputSynchronizationError extends Error {
  changeKind: SemanticInputChangeKind;

  constructor(
    changeKind: SemanticInputChangeKind,
    message = "Semantic input changed while synchronization was running.",
  ) {
    super(message);
    this.name = "SemanticInputSynchronizationError";
    this.changeKind = changeKind;
  }

  /** Keep retry eligibility monotonic after a non-enrollment change. */
  updateChangeKind(changeKind: SemanticInputChangeKind): void {
    if (this.changeKind === "enrollment" && changeKind !== "enrollment") {
      this.changeKind = changeKind;
    }
  }
}

/** Test whether a failed pass can rejoin after a new document enrolled. */
export function isSemanticInputEnrollmentError(
  error: unknown,
): error is SemanticInputSynchronizationError {
  return error instanceof SemanticInputSynchronizationError && error.changeKind === "enrollment";
}
