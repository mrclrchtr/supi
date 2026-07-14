/** Execution controls shared by Workspace code-intelligence session workflows. */

/** Stable progress event emitted by a session-owned workflow. */
export interface WorkflowProgressEvent {
  readonly intent:
    | "resolve"
    | "inspect"
    | "orientation"
    | "graph"
    | "find"
    | "health"
    | "refactor-plan"
    | "refactor-apply";
  readonly phase: string;
  readonly message: string;
}

/** Per-call cancellation and progress controls. */
export interface WorkflowControl {
  readonly signal?: AbortSignal;
  readonly progress?: (event: WorkflowProgressEvent) => void;
}

/** Emit one stable progress event when a sink is present. */
export function reportProgress(
  control: WorkflowControl | undefined,
  event: WorkflowProgressEvent,
): void {
  control?.progress?.(Object.freeze(event));
}

/** Throw the platform-standard cancellation reason before starting a phase. */
export function throwIfAborted(control: WorkflowControl | undefined): void {
  control?.signal?.throwIfAborted();
}
