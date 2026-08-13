import type { AgentToolUpdateCallback } from "@earendil-works/pi-coding-agent";
import type { WorkspaceCodeIntelligenceSession } from "../session/session.ts";
import type {
  ContextDetails,
  HealthDetails,
  InspectDetails,
  ResolveDetails,
  SearchDetails,
  ToolDisplaySection,
  ToolOutputTruncationDetails,
  ToolResultStatus,
} from "../tool/result/types.ts";

/**
 * Execution context passed to every code-intelligence tool executor.
 *
 * The adapter in `tool/register.ts` builds this from the pi
 * `ToolDefinition.execute` arguments and forwards it to `spec.run`.
 * `signal` and `onUpdate` are optional. An executor that does not yet use
 * them can still type its ctx as `{ cwd: string }` (a structural supertype —
 * it destructures only `cwd` and ignores the rest) and keep compiling; all
 * current executors use this full type, and long-running ones forward `signal`
 * to subprocesses / emit coarse `onUpdate` beats.
 *
 * The `session` property carries the per-workspace
 * `WorkspaceCodeIntelligenceSession` seam (ADR 0015) for workflow policy,
 * target resolution, and plan management. Executors must prefer
 * `ctx.session` over ad-hoc session factories.
 */
export interface CodeIntelToolExecCtx {
  cwd: string;
  /** Opaque identity for Debug Events directly owned by this public Tool call. */
  operationId?: string;
  /** Abort signal from the agent runtime; forward to long-running subprocesses. */
  signal?: AbortSignal;
  /** Progress callback; long-running executors emit coarse beats, not chatty ones. */
  onUpdate?: AgentToolUpdateCallback;
  /**
   * Per-workspace code-intelligence session.
   *
   * Exposes typed intent workflows while keeping providers, mutable targets,
   * plans, and runtime policy internal. Present on every execution.
   */
  session: WorkspaceCodeIntelligenceSession;
}

/** Shared metadata attached to one persisted Code Intelligence result. */
export interface CodeIntelResultDetails {
  status?: ToolResultStatus;
  message?: string;
  displaySections?: readonly ToolDisplaySection[];
  truncation?: ToolOutputTruncationDetails;
}

/** Tool result shape returned by executeAction. */
export interface CodeIntelResult {
  content: string;
  details?:
    | (CodeIntelResultDetails & { type: "context"; data: ContextDetails })
    | (CodeIntelResultDetails & { type: "inspect"; data: InspectDetails })
    | (CodeIntelResultDetails & { type: "search"; data: SearchDetails })
    | (CodeIntelResultDetails & { type: "resolve"; data: ResolveDetails })
    | (CodeIntelResultDetails & { type: "health"; data: HealthDetails });
}
