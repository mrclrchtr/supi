import {
  type CodeRequestControl,
  isCodeRequestDeadlineError,
  isCodeRequestInterrupted,
  throwIfCodeRequestInterrupted,
} from "@mrclrchtr/supi-code-runtime/api";

/** Worker-local request control with one shared atomic cancellation slot. */
export interface StructuralRequestControl extends CodeRequestControl {
  readonly cancellationFlag?: Int32Array;
}

/** Test whether caller, deadline, or the parent-side atomic flag stopped work. */
export function isStructuralRequestInterrupted(
  control: StructuralRequestControl | undefined,
): boolean {
  return atomicCancellationRequested(control) || isCodeRequestInterrupted(control);
}

/** Throw for caller, deadline, or parent-side atomic interruption. */
export function throwIfStructuralRequestInterrupted(
  control: StructuralRequestControl | undefined,
): void {
  throwIfCodeRequestInterrupted(control);
  if (atomicCancellationRequested(control)) throw structuralCancellationError();
}

/** Identify one error as a Worker-local request interruption. */
export function isStructuralRequestInterruption(
  error: unknown,
  control: StructuralRequestControl | undefined,
): boolean {
  return (
    isCodeRequestDeadlineError(error) ||
    control?.signal?.aborted === true ||
    atomicCancellationRequested(control)
  );
}

function atomicCancellationRequested(control: StructuralRequestControl | undefined): boolean {
  return control?.cancellationFlag ? Atomics.load(control.cancellationFlag, 0) !== 0 : false;
}

function structuralCancellationError(): Error {
  const error = new Error("Structural request cancelled");
  error.name = "AbortError";
  return error;
}
