/**
 * Lightweight tool-execution pipeline.
 *
 * Executors compose stages that gate before the tool-specific logic:
 * targetId expansion, scope resolution, param validation, semantic
 * readiness, and capability checks. Each stage returns a
 * {@link PipeOutcome}: `{ kind: "continue" }` to proceed to the next
 * stage, or `{ kind: "error", result }` to short-circuit the pipeline.
 *
 * Usage in an executor:
 *
 * ```ts
 * return runPipe(params, ctx, [
 *   expandTargetId((msg) => ({ content: msg, details: ... })),
 *   resolveScopeParam((reason) => ({ content: reason, details: ... })),
 *   validateParams(myValidator, (msg) => ({ content: msg, details: ... })),
 *   gateSemanticReadiness("code_graph"),
 * ], async (p, c) => {
 *   // tool-specific execution
 * });
 * ```
 */

import { match } from "ts-pattern";
import { ensureSemanticReadiness } from "../../analysis/readiness.ts";
import { resolveScope } from "../../analysis/search/ripgrep.ts";
import { routeFor } from "../../analysis/target/planner.ts";
import type {
  CodeIntelligenceToolName,
  CodeIntelResult,
  CodeIntelToolExecCtx,
} from "../../types/index.ts";
import { searchErrorResult } from "./error-results.ts";
import { renderSemanticReadinessTimeout } from "./readiness-message.ts";

// Re-export for stage consumers
export type { CodeIntelligenceToolName };

// ── Param accessors ──────────────────────────────────────────────────

/**
 * Read a param value for runtime inspection in generic pipeline stages
 * and cross-field validation rules.
 *
 * Centralizes the {@link Record}<string, unknown> cast needed when
 * generic code accesses params by dynamic/computed keys. Callers get
 * `unknown` back and must narrow to the expected type.
 */
export function inspectParam<P>(params: P, key: keyof P & string): unknown {
  return (params as Record<string, unknown>)[key];
}

/**
 * Set a param value in generic pipeline code.
 *
 * Companion to {@link inspectParam} for mutation stages like
 * {@link expandTargetId} and {@link resolveScopeParam}.
 */
export function setParam<P>(params: P, key: keyof P & string, value: unknown): void {
  (params as Record<string, unknown>)[key] = value;
}

// ── Types ─────────────────────────────────────────────────────────────

/**
 * Outcome of a single pipeline stage.
 *
 * `continue` — proceed to the next stage (or the execute function).
 * `error`    — short-circuit the pipeline with the given result.
 */
export type PipeOutcome = { kind: "continue" } | { kind: "error"; result: CodeIntelResult };

/**
 * A pipeline stage: receives (possibly mutated) params and the execution
 * context. Returns {@link PipeOutcome} — `{ kind: "continue" }` to
 * advance to the next stage, or `{ kind: "error", result }` to
 * short-circuit immediately.
 */
export type PipeStage<P> = (
  params: P,
  ctx: CodeIntelToolExecCtx,
) => Promise<PipeOutcome> | PipeOutcome;

// ── Orchestrator ──────────────────────────────────────────────────────

/**
 * Run a sequence of gating stages then the tool-specific execute function.
 *
 * Stages are executed in order. The first stage that returns
 * `{ kind: "error" }` short-circuits the pipeline and its result is
 * returned to the caller. If every stage returns `{ kind: "continue" }`,
 * `execute(params, ctx)` runs.
 */
export async function runPipe<P>(
  params: P,
  ctx: CodeIntelToolExecCtx,
  stages: PipeStage<P>[],
  execute: (params: P, ctx: CodeIntelToolExecCtx) => Promise<CodeIntelResult>,
): Promise<CodeIntelResult> {
  for (const stage of stages) {
    const outcome = await stage(params, ctx);
    if (outcome.kind === "error") return outcome.result;
  }
  return execute(params, ctx);
}

// ── Stage factories ───────────────────────────────────────────────────

/** Minimum parameter shape needed by `expandTargetId`. */
export interface HasTargetParams {
  targetId?: string;
  file?: string;
  line?: number;
  character?: number;
  /** Set by expandTargetId stage — resolved name from the stored target entry. */
  _expandedName?: string | null;
  /** Set by expandTargetId stage — anchor kind from the stored target entry. */
  _expandedAnchorKind?: string | null;
}

/**
 * Expand an optional `targetId` into file/line/character params.
 *
 * On success the stage mutates `params.file`, `params.line`, and
 * `params.character` from the stored entry. On error it calls
 * `onError(message)` to build a tool-appropriate error result.
 *
 * A missing/null targetId is not an error — the stage passes through
 * (no expansion, params unchanged).
 */
export function expandTargetId<P extends HasTargetParams>(
  onError: (message: string) => CodeIntelResult,
): PipeStage<P> {
  return (params, ctx) => {
    const expansion = ctx.session.expandTargetId(params);
    if (expansion.kind === "error") return { kind: "error", result: onError(expansion.message) };
    if (expansion.kind === "ok") {
      params.file = expansion.file;
      params.line = expansion.line;
      params.character = expansion.character;
      params._expandedName = expansion.targetName;
      params._expandedAnchorKind = expansion.entry.anchorKind;
    }
    return { kind: "continue" };
  };
}

/** Minimum parameter shape needed by `resolveScope`. */
export interface HasScopeParam {
  scope?: string;
}

/**
 * Resolve the `scope` parameter to an absolute path.
 *
 * Mutates `params.scope` to the resolved absolute path. An undefined
 * scope passes through unchanged. On resolution error calls
 * `onError(reason)`.
 *
 * @param paramName — defaults to `"scope"`.
 */
export function resolveScopeParam<P extends HasScopeParam>(
  onError: (reason: string) => CodeIntelResult,
  paramName: keyof P & string = "scope" as keyof P & string,
): PipeStage<P> {
  return (params, ctx) => {
    const raw = inspectParam(params, paramName) as string | undefined;
    if (raw === undefined) return { kind: "continue" };

    const result = resolveScope(raw, ctx.cwd);
    if (result.kind === "error") return { kind: "error", result: onError(result.reason) };

    setParam(params, paramName, result.path);
    return { kind: "continue" };
  };
}

/**
 * Apply cross-field validation rules after TypeBox schema validation.
 *
 * pi already validates structural types, required fields, and enum
 * values against the TypeBox schema in {@link ./schemas.ts} before
 * calling executors. This stage handles only cross-field constraints
 * that TypeBox cannot express (pairing, mutual exclusion, filesystem
 * checks, semantic consistency).
 *
 * The validator receives `(params, cwd)` and returns `null` when
 * valid, or an error message string. The stage calls `onError(message)`
 * to build a tool-appropriate error result.
 */
export function validateParams<P>(
  validator: (params: P, cwd: string) => string | null,
  onError: (message: string) => CodeIntelResult,
): PipeStage<P> {
  return (params, ctx) => {
    const message = validator(params, ctx.cwd);
    if (message) return { kind: "error", result: onError(message) };
    return { kind: "continue" };
  };
}

/** Options for {@link gateSemanticReadiness}. */
export interface SemanticGateOptions {
  /**
   * Optional param key for the file path used for file-scoped readiness.
   * When provided, readiness waits for the specific file. Defaults to
   * workspace-scoped readiness.
   */
  fileParam?: string;

  /** Build a result when readiness times out. */
  onTimeout?: (toolName: string, timeoutMs: number) => CodeIntelResult;

  /** When true, throw (whole-tool unavailable) instead of returning an error result. */
  throwOnUnavailable?: boolean;

  /**
   * When true, let "unavailable" pass through to the execute function
   * instead of returning an error. Use when the use-case layer handles
   * missing providers with explicit unavailable-section notes.
   * `throwOnUnavailable` takes precedence when both are true.
   */
  passThroughOnUnavailable?: boolean;

  /** Build a result when readiness is permanently unavailable. */
  onUnavailable?: (reason: string) => CodeIntelResult;
}

/**
 * Gate execution behind semantic (LSP) readiness.
 *
 * Waits up to the default timeout for the LSP to be ready for the
 * workspace (or a specific file). On timeout, calls `onTimeout` if
 * provided, otherwise builds a default timeout result. When
 * `throwOnUnavailable` is true and the provider is permanently
 * unavailable, the stage throws so pi marks the call as an error.
 */
export function gateSemanticReadiness<P>(
  toolName: CodeIntelligenceToolName,
  opts: SemanticGateOptions = {},
): PipeStage<P> {
  return async (params, ctx) => {
    // opts.fileParam is a runtime string from an options bag, not a
    // compile-time keyof P — keep the cast local instead of routing
    // through inspectParam which requires keyof P & string.
    const file = opts.fileParam
      ? ((params as Record<string, unknown>)[opts.fileParam] as string | undefined)
      : undefined;

    const scope = file ? { kind: "file" as const, file } : { kind: "workspace" as const };
    const readiness = await ensureSemanticReadiness(ctx.cwd, scope);

    if (readiness.kind === "ready") return { kind: "continue" };

    return handleNonReadyReadiness(readiness, toolName, opts);
  };
}

/** Handle timeout or unavailable readiness, applying tool-specific callbacks. */
function handleNonReadyReadiness(
  readiness: { kind: "timeout" } | { kind: "unavailable"; reason: string },
  toolName: CodeIntelligenceToolName,
  opts: SemanticGateOptions,
): PipeOutcome {
  return match(readiness)
    .with({ kind: "timeout" }, () => {
      if (opts.onTimeout)
        return { kind: "error" as const, result: opts.onTimeout(toolName, 15_000) };
      return defaultTimeoutOutcome(toolName);
    })
    .with({ kind: "unavailable" }, ({ reason }) => {
      if (opts.throwOnUnavailable) throw new Error(reason);
      if (opts.passThroughOnUnavailable) return { kind: "continue" as const };
      if (opts.onUnavailable) return { kind: "error" as const, result: opts.onUnavailable(reason) };
      return defaultUnavailableOutcome(reason);
    })
    .exhaustive() as PipeOutcome;
}

function defaultTimeoutOutcome(toolName: string): PipeOutcome {
  return {
    kind: "error",
    result: searchErrorResult(renderSemanticReadinessTimeout(toolName, 15_000)),
  };
}

function defaultUnavailableOutcome(reason: string): PipeOutcome {
  return { kind: "error", result: searchErrorResult(`**Error:** ${reason}`) };
}

/**
 * Gate execution behind capability availability.
 *
 * Calls `routeFor(cwd, toolName)`. When `preferred === "unavailable"`
 * the stage throws (whole-tool capability-unavailable) so pi marks the
 * call as an error. Partial per-relation unavailability is NOT gated
 * here — executors surface that through best-effort notes.
 *
 * This is a sync stage — no async work.
 */
export function gateCapability<P>(toolName: CodeIntelligenceToolName): PipeStage<P> {
  return (_params, ctx) => {
    const route = routeFor(ctx.cwd, toolName);
    if (route.preferred === "unavailable") {
      throw new Error(
        `No analysis provider is available for this workspace. Check \`code_health\` for LSP and tree-sitter status.`,
      );
    }
    return { kind: "continue" };
  };
}
