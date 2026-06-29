import type { AgentToolUpdateCallback } from "@earendil-works/pi-coding-agent";
import type { WorkspaceCodeIntelligenceSession } from "../session/session.ts";
import type {
  BriefDetails,
  ContextDetails,
  HealthDetails,
  ImpactDetails,
  InspectDetails,
  ResolveDetails,
  SearchDetails,
} from "./details.ts";

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
 * `WorkspaceCodeIntelligenceSession` facade (ADR 0008) for centralized
 * provider access, target resolution, and plan management. Executors
 * must prefer `ctx.session` over ad-hoc session factories.
 */
export interface CodeIntelToolExecCtx {
  cwd: string;
  /** Abort signal from the agent runtime; forward to long-running subprocesses. */
  signal?: AbortSignal;
  /** Progress callback; long-running executors emit coarse beats, not chatty ones. */
  onUpdate?: AgentToolUpdateCallback;
  /**
   * Per-workspace code-intelligence session facade.
   *
   * Provides centralized access to:
   * - Provider state: {@link WorkspaceCodeIntelligenceSession.getProviders}
   * - Target resolution: {@link WorkspaceCodeIntelligenceSession.expandTargetId}
   * - Plan management: {@link WorkspaceCodeIntelligenceSession.storePlan}
   *
   * Present on every execution. Executors that need it should destructure
   * `{ cwd, session }` from their ctx parameter.
   */
  session: WorkspaceCodeIntelligenceSession;
}

/** Tool result shape returned by executeAction. */
export interface CodeIntelResult {
  content: string;
  details?:
    | { type: "brief"; data: BriefDetails }
    | { type: "context"; data: ContextDetails }
    | { type: "inspect"; data: InspectDetails }
    | { type: "search"; data: SearchDetails }
    | { type: "impact"; data: ImpactDetails }
    | { type: "resolve"; data: ResolveDetails }
    | { type: "health"; data: HealthDetails };
}
