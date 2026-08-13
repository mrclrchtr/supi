import type { CodeRequestControl } from "./capability/types.ts";

/** Error raised when an absolute code-request deadline has elapsed. */
export class CodeRequestDeadlineError extends Error {
  constructor() {
    super("Code request deadline exceeded");
    this.name = "CodeRequestDeadlineError";
  }
}

/** Test whether request cancellation or its absolute deadline has elapsed. */
export function isCodeRequestInterrupted(
  control: CodeRequestControl | undefined,
  now: () => number = Date.now,
): boolean {
  return (
    control?.signal?.aborted === true ||
    (control?.deadline !== undefined && now() >= control.deadline)
  );
}

/** Throw the caller abort reason or a canonical absolute-deadline error. */
export function throwIfCodeRequestInterrupted(
  control: CodeRequestControl | undefined,
  now: () => number = Date.now,
): void {
  control?.signal?.throwIfAborted();
  if (control?.deadline !== undefined && now() >= control.deadline) {
    throw new CodeRequestDeadlineError();
  }
}

/** Identify an absolute-deadline error across bundled package copies. */
export function isCodeRequestDeadlineError(error: unknown): error is Error {
  return (
    error instanceof CodeRequestDeadlineError ||
    (error instanceof Error && error.name === "CodeRequestDeadlineError")
  );
}

/** Identify an error caused by the supplied request control. */
export function isCodeRequestInterruption(
  error: unknown,
  control: CodeRequestControl | undefined,
): boolean {
  return isCodeRequestDeadlineError(error) || control?.signal?.aborted === true;
}
