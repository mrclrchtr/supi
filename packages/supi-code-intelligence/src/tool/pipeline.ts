/**
 * Lightweight tool-execution pipeline.
 *
 * Executors compose stages that gate before the tool-specific logic:
 * targetId expansion, scope resolution, param validation, semantic
 * readiness, and capability checks. Each stage can short-circuit
 * with a CodeIntelResult; a null return means "continue."
 *
 * Usage in an executor:
 *
 * ```ts
 * return runPipe(params, ctx, [
 *   expandTargetId((msg) => ({ content: msg, details: ... })),
 *   resolveScope(),
 *   validateParams(myValidator, (msg) => ({ content: msg, details: ... })),
 *   gateSemanticReadiness("code_graph"),
 * ], async (p, c) => {
 *   // tool-specific execution
 * });
 * ```
 */

import { routeFor } from "../analysis/routing/planner.ts";
import { resolveScope } from "../analysis/search/helpers.ts";
import type { CodeIntelligenceToolName } from "../intent/types.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../types.ts";
import { ensureSemanticReadiness, renderSemanticReadinessTimeout } from "./semantic-readiness.ts";

// Re-export for stage consumers
export type { CodeIntelligenceToolName };

// ── Types ─────────────────────────────────────────────────────────────

/**
 * A pipeline stage: receives (possibly mutated) params and the execution
 * context. Return `null` to continue to the next stage; return a
 * `CodeIntelResult` to short-circuit the pipeline immediately.
 */
export type PipeStage<P> = (
  params: P,
  ctx: CodeIntelToolExecCtx,
) => Promise<CodeIntelResult | null> | CodeIntelResult | null;

// ── Orchestrator ──────────────────────────────────────────────────────

/**
 * Run a sequence of gating stages then the tool-specific execute function.
 *
 * Stages are executed in order. The first stage that returns non-null
 * short-circuits the pipeline and that result is returned to the caller.
 * If every stage returns null, `execute(params, ctx)` runs.
 */
export async function runPipe<P>(
  params: P,
  ctx: CodeIntelToolExecCtx,
  stages: PipeStage<P>[],
  execute: (params: P, ctx: CodeIntelToolExecCtx) => Promise<CodeIntelResult>,
): Promise<CodeIntelResult> {
  for (const stage of stages) {
    const error = await stage(params, ctx);
    if (error) return error;
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
    if (expansion.kind === "error") return onError(expansion.message);
    if (expansion.kind === "ok") {
      params.file = expansion.file;
      params.line = expansion.line;
      params.character = expansion.character;
      params._expandedName = expansion.targetName;
      params._expandedAnchorKind = expansion.entry.anchorKind;
    }
    return null;
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
    const raw = (params as Record<string, unknown>)[paramName] as string | undefined;
    if (raw === undefined) return null;

    const result = resolveScope(raw, ctx.cwd);
    if (result.kind === "error") return onError(result.reason);

    (params as Record<string, unknown>)[paramName] = result.path;
    return null;
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
    if (message) return onError(message);
    return null;
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
    const file = opts.fileParam
      ? ((params as Record<string, unknown>)[opts.fileParam] as string | undefined)
      : undefined;

    const scope = file ? { kind: "file" as const, file } : { kind: "workspace" as const };
    const readiness = await ensureSemanticReadiness(ctx.cwd, scope);

    if (readiness.kind === "ready") return null;

    return handleNonReadyReadiness(readiness, toolName, opts);
  };
}

/** Handle timeout or unavailable readiness, applying tool-specific callbacks. */
function handleNonReadyReadiness(
  readiness: { kind: "timeout" } | { kind: "unavailable"; reason: string },
  toolName: CodeIntelligenceToolName,
  opts: SemanticGateOptions,
): CodeIntelResult | null {
  if (readiness.kind === "timeout") {
    if (opts.onTimeout) return opts.onTimeout(toolName, 15_000);
    return defaultTimeoutResult(toolName);
  }

  // readiness.kind === "unavailable"
  if (opts.throwOnUnavailable) {
    throw new Error(readiness.reason);
  }

  if (opts.passThroughOnUnavailable) return null;

  if (opts.onUnavailable) return opts.onUnavailable(readiness.reason);

  return defaultUnavailableResult(readiness.reason);
}

function defaultTimeoutResult(toolName: string): CodeIntelResult {
  return {
    content: renderSemanticReadinessTimeout(toolName, 15_000),
    details: emptySearchDetails(),
  } as CodeIntelResult;
}

function defaultUnavailableResult(reason: string): CodeIntelResult {
  return {
    content: `**Error:** ${reason}`,
    details: emptySearchDetails(),
  } as CodeIntelResult;
}

function emptySearchDetails() {
  return {
    type: "search" as const,
    data: {
      confidence: "unavailable" as const,
      scope: null,
      candidateCount: 0,
      omittedCount: 0,
      nextQueries: [],
    },
  };
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
    return null;
  };
}
