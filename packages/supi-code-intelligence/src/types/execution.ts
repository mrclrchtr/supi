import type { AgentToolUpdateCallback } from "@earendil-works/pi-coding-agent";
import type { WorkspaceCodeIntelligenceSession } from "../session/session.ts";
import type {
  ContextDetails,
  HealthDetails,
  InspectDetails,
  ResolveDetails,
  SearchDetails,
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

/** Tool result shape returned by executeAction. */
export interface CodeIntelResult {
  content: string;
  details?:
    | { type: "context"; data: ContextDetails }
    | { type: "inspect"; data: InspectDetails }
    | { type: "search"; data: SearchDetails }
    | { type: "resolve"; data: ResolveDetails }
    | { type: "health"; data: HealthDetails };
}
