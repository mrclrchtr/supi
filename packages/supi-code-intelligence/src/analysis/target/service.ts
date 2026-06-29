/**
 * code_resolve business logic.
 *
 * Normalizes code_resolve params (query, scope, kind, file, line, character)
 * into the existing targeting pipeline, registers resolved targets in the
 * target store, and returns a typed intermediate result that the tool
 * executor renders into markdown + details.
 */
import { existsSync } from "node:fs";
import type { WorkspaceCodeIntelligenceSession } from "../../session/session.ts";
import type { CodeProvider } from "../provider.ts";
import { getCodeProviderState } from "../provider.ts";
import { normalizePath } from "../search/ripgrep.ts";
import { resolveAnchoredSymbolTarget } from "./anchored.ts";
import { resolveFileOnlyInput, tryPathLikeQuery } from "./file-resolution.ts";
import {
  type ResolveServiceParams,
  type ResolveServiceResult,
  registerCandidate,
  registerFromTarget,
} from "./resolve-common.ts";
import { resolveSymbolTarget as resolveSymbol } from "./symbol.ts";
import type { TargetOutcome } from "./types.ts";

export type {
  DisambiguationCandidate,
  ResolveServiceParams,
  ResolveServiceResult,
} from "./resolve-common.ts";

// ── Validation ────────────────────────────────────────────────────────

/**
 * Cross-field validation for code_resolve params — defense-in-depth.
 *
 * The tool executor pipeline already validates via
 * {@link ../../tool/infra/cross-field.ts!resolveCrossFieldRules}, which is the
 * canonical source of these rules for tool-level use. This copy exists so
 * the resolve service validates its own inputs when called outside the
 * pipeline (e.g. from code_orientation's coordinate resolution).
 *
 * TypeBox (via pi schema validation) already enforces:
 * - kind must be a valid StringEnum value
 * - line/character must be numbers >= 1
 * - additionalProperties: false
 */
export function validateResolveParams(params: ResolveServiceParams): string | null {
  const hasQuery = params.query !== undefined && params.query.length > 0;
  const hasFile = params.file !== undefined && params.file.length > 0;
  const hasLine = params.line !== undefined;
  const hasCharacter = params.character !== undefined;
  if (!hasQuery && !hasFile) {
    return "**Error:** `code_resolve` requires either `query` (for symbol/search resolution) or `file` (for anchored/file-level resolution).";
  }
  if (hasLine !== hasCharacter) {
    return "**Error:** `line` and `character` must be provided together.";
  }
  if ((hasLine || hasCharacter) && !hasFile) {
    return "**Error:** `line` and `character` require `file`.";
  }
  return null;
}

// ── Resolver sub-routines ─────────────────────────────────────────────

/** Resolve anchored (file + line + character) input via provider-backed symbol resolution. */
async function resolveAnchoredInput(
  params: ResolveServiceParams,
  session: WorkspaceCodeIntelligenceSession,
  _maxResults: number,
  provider: CodeProvider | null,
): Promise<ResolveServiceResult> {
  const cwd = session.cwd;
  const file = params.file;
  const line = params.line;
  const character = params.character;
  if (!file) {
    return { kind: "error", message: "**Error:** File required for anchored resolution." };
  }
  if (line == null || character == null) {
    return {
      kind: "error",
      message: "**Error:** Line and character required for anchored resolution.",
    };
  }
  const resolvedFile = normalizePath(file, cwd);
  if (!existsSync(resolvedFile)) {
    return { kind: "error", message: `**Error:** File not found: \`${file}\`` };
  }
  const outcome = await resolveAnchoredSymbolTarget(resolvedFile, line, character, provider);
  if (outcome.kind === "error") {
    return { kind: "error", message: outcome.message };
  }
  if (outcome.kind === "resolved") {
    const entry = registerFromTarget(outcome.target, session, "anchored");
    return {
      kind: "resolved",
      targets: [entry],
      confidence: entry.confidence,
      omittedCount: 0,
      nextQueries: [
        "`code_graph` for usages of this target",
        '`code_graph` with `relations: ["callees"]` for direct structural calls from this target',
        "`code_impact` for blast radius",
      ],
    };
  }
  // Disambiguation — register each candidate and surface targetIds.
  const disambig = outcome as Extract<TargetOutcome, { kind: "disambiguation" }>;
  const candidates = disambig.candidates.map((c) => registerCandidate(c, session));
  return {
    kind: "disambiguation",
    candidates,
    omittedCount: disambig.omittedCount,
    nextQueries: [
      "Use `file` + `line` + `character` for one of the candidates above (pass the identifier coordinate)",
      "Or refine with `query` + `scope` or `kind` filters",
    ],
  };
}

/** Resolve query/symbol input via semantic workspace symbols. */
async function resolveQueryTarget(opts: {
  query: string;
  kind: string | undefined;
  scope: string | undefined;
  session: WorkspaceCodeIntelligenceSession;
  provider: CodeProvider;
  maxResults: number;
}): Promise<ResolveServiceResult> {
  const { query, kind, scope, session, provider, maxResults } = opts;
  const cwd = session.cwd;

  const scopePath = scope ? normalizePath(scope, cwd) : undefined;
  const symbolKind = kind !== undefined && kind !== "symbol" ? kind : undefined;
  const exportedOnly = kind === "export" ? true : undefined;

  const outcome = await resolveSymbol(query, cwd, provider, {
    path: scopePath,
    kind: symbolKind,
    exportedOnly,
    maxResults,
  });
  if (outcome.kind === "error") {
    return { kind: "error", message: outcome.message };
  }
  if (outcome.kind === "resolved") {
    const entry = registerFromTarget(outcome.target, session, "symbol");
    return {
      kind: "resolved",
      targets: [entry],
      confidence: entry.confidence,
      omittedCount: 0,
      nextQueries: [
        "`code_graph` for usages of this target",
        '`code_graph` with `relations: ["callees"]` for direct structural calls from this target',
        "`code_impact` for blast radius",
      ],
    };
  }
  // resolveSymbol never returns "group", so only disambiguation remains
  const disambig = outcome as Extract<TargetOutcome, { kind: "disambiguation" }>;
  const candidates = disambig.candidates.map((c) => registerCandidate(c, session));
  return {
    kind: "disambiguation",
    candidates,
    omittedCount: disambig.omittedCount,
    nextQueries: [
      "Use `file` + `line` + `character` for one of the candidates above",
      "Or refine the query with `scope` or `kind` filters",
    ],
  };
}

// ── Main entry ────────────────────────────────────────────────────────

/**
 * Execute the code_resolve service.
 *
 * Returns a structured intermediate result (resolved, disambiguation, or error)
 * that the tool executor renders into user-facing markdown + details.
 */
export async function executeResolveService(
  params: ResolveServiceParams,
  session: WorkspaceCodeIntelligenceSession,
): Promise<ResolveServiceResult> {
  const cwd = session.cwd;
  const validationError = validateResolveParams(params);
  if (validationError) {
    return { kind: "error", message: validationError };
  }
  const providerState = getCodeProviderState(cwd);
  const provider = providerState.kind === "ready" ? providerState.provider : null;
  const maxResults = params.maxResults ?? 10;
  // Anchored resolution
  if (params.file && params.line != null && params.character != null) {
    return resolveAnchoredInput(params, session, maxResults, provider);
  }
  // File-only resolution
  if (params.file && !params.query) {
    return resolveFileOnlyInput(params, session, maxResults, provider);
  }
  // Query resolution
  if (!params.query) {
    return {
      kind: "error",
      message: "**Error:** Provide a `query` or `file` for resolution.",
    };
  }
  // Special case: path-like query with kind file
  const pathResult = await tryPathLikeQuery(params, session, maxResults, provider);
  if (pathResult) return pathResult;
  // Standard symbol resolution requires semantic provider
  if (provider === null) {
    return {
      kind: "error",
      message:
        "**Error:** Symbol query requires active LSP. Use anchored coordinates (file + line + character) or a file-only query.",
    };
  }
  return resolveQueryTarget({
    query: params.query,
    kind: params.kind,
    scope: params.scope,
    session,
    provider,
    maxResults,
  });
}
