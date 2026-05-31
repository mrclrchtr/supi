/**
 * code_resolve business logic.
 *
 * Normalizes code_resolve params (query, scope, kind, file, line, character)
 * into the existing targeting pipeline, registers resolved targets in the
 * target store, and returns a typed intermediate result that the tool
 * executor renders into markdown + details.
 *
 * biome-ignore lint/nursery/noExcessiveLinesPerFile: split in later phase when file grows further
 */
import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import { normalizePath } from "../../search-helpers.ts";
import { resolveAnchoredTarget as resolveAnchored } from "../../targeting/resolve-anchored.ts";
import { resolveFileTargetGroup as resolveFile } from "../../targeting/resolve-file.ts";
import { resolveSymbolTarget as resolveSymbol } from "../../targeting/resolve-symbol.ts";
import type { TargetOutcome } from "../../targeting/types.ts";
import {
  registerWorkflowTarget,
  type TargetRegistrationInput,
} from "../../workflow/target-store.ts";
import type { CodeProvider } from "../context/request-context.ts";
import { getCodeProviderState } from "../context/request-context.ts";
// ── Types ─────────────────────────────────────────────────────────────
export interface ResolveServiceParams {
  query?: string;
  scope?: string;
  kind?: string;
  file?: string;
  line?: number;
  character?: number;
  maxResults?: number;
}
/** One resolved target with handles, ready for markdown rendering. */
export interface ResolvedTargetEntry {
  targetId: string;
  spanId: string;
  file: string;
  displayLine: number;
  displayCharacter: number;
  name: string | null;
  kind: string | null;
  confidence: ConfidenceMode;
  provenance: string;
}
/** One disambiguation candidate with a target handle. */
export interface DisambiguationCandidateEntry {
  targetId: string;
  name: string;
  kind: string | null;
  container: string | null;
  file: string;
  line: number;
  character: number;
  reason: string;
  rank: number;
}
export type ResolveServiceResult =
  | {
      kind: "resolved";
      targets: ResolvedTargetEntry[];
      confidence: ConfidenceMode;
      omittedCount: number;
      nextQueries: string[];
    }
  | {
      kind: "disambiguation";
      candidates: DisambiguationCandidateEntry[];
      omittedCount: number;
      nextQueries: string[];
    }
  | {
      kind: "error";
      message: string;
    };
// ── Validation ────────────────────────────────────────────────────────
/**
 * Validate cross-field runtime rules for code_resolve params.
 * Returns an error message string when validation fails, or null when valid.
 */
export function validateResolveParams(params: ResolveServiceParams): string | null {
  const hasQuery = params.query !== undefined && params.query.length > 0;
  const hasFile = params.file !== undefined && params.file.length > 0;
  const hasLine = params.line !== undefined;
  const hasCharacter = params.character !== undefined;
  if (!hasQuery && !hasFile) {
    return "**Error:** `code_resolve` requires either `query` (for symbol/search resolution) or `file` (for anchored/file-level resolution).";
  }
  // line/character must be provided together
  if (hasLine !== hasCharacter) {
    return "**Error:** `line` and `character` must be provided together.";
  }
  // line/character require file
  if ((hasLine || hasCharacter) && !hasFile) {
    return "**Error:** `line` and `character` require `file`.";
  }
  if (
    params.kind &&
    !new Set(["symbol", "function", "class", "interface", "type", "file", "File", "export"]).has(
      params.kind,
    )
  ) {
    return `**Error:** Unsupported \`kind\` \`${params.kind}\`. Use \`"symbol"\`, \`"function"\`, \`"class"\`, \`"interface"\`, \`"type"\`, \`"file"\`, or \`"export"\`.`;
  }
  return null;
}
// ── Registration helper ───────────────────────────────────────────────
/**
 * Register a single resolved target from the targeting pipeline
 * into the workflow target store, returning the entry with handles.
 */
function registerFromTarget(
  target: {
    file: string;
    position: { line: number; character: number };
    displayLine: number;
    displayCharacter: number;
    name: string | null;
    kind: string | null;
    confidence: string;
  },
  cwd: string,
  provenance: string,
): ResolvedTargetEntry {
  const input: TargetRegistrationInput = {
    file: target.file,
    position: target.position,
    displayLine: target.displayLine,
    displayCharacter: target.displayCharacter,
    name: target.name,
    kind: target.kind,
    confidence: target.confidence as ConfidenceMode,
    provenance,
  };
  const { targetId, spanId } = registerWorkflowTarget(cwd, input);
  return {
    targetId,
    spanId,
    file: relative(cwd, target.file),
    displayLine: target.displayLine,
    displayCharacter: target.displayCharacter,
    name: target.name,
    kind: target.kind,
    confidence: target.confidence as ConfidenceMode,
    provenance,
  };
}
/** Register a disambiguation candidate in the target store. */
function registerCandidate(
  c: {
    name: string;
    kind: string | null;
    container: string | null;
    file: string;
    line: number;
    character: number;
    reason: string;
    rank: number;
  },
  cwd: string,
): DisambiguationCandidateEntry {
  const input: TargetRegistrationInput = {
    file: resolve(cwd, c.file),
    position: { line: c.line - 1, character: c.character - 1 },
    displayLine: c.line,
    displayCharacter: c.character,
    name: c.name,
    kind: c.kind,
    confidence: "semantic" as ConfidenceMode,
    provenance: "disambiguation",
  };
  const { targetId } = registerWorkflowTarget(cwd, input);
  return {
    targetId,
    name: c.name,
    kind: c.kind,
    container: c.container,
    file: c.file,
    line: c.line,
    character: c.character,
    reason: c.reason,
    rank: c.rank,
  };
}
// ── Resolver sub-routines ────────────────────────────────────────────
/** Resolve anchored (file + line + character) input. */
function resolveAnchoredInput(
  params: ResolveServiceParams,
  cwd: string,
  _maxResults: number,
): ResolveServiceResult {
  // Guard: caller ensures file/line/character are present for anchored
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
  const outcome = resolveAnchored(resolvedFile, line, character);
  if (outcome.kind === "error") {
    return { kind: "error", message: outcome.message };
  }
  if (outcome.kind === "resolved") {
    const entry = registerFromTarget(outcome.target, cwd, "anchored");
    return {
      kind: "resolved",
      targets: [entry],
      confidence: entry.confidence,
      omittedCount: 0,
      nextQueries: [
        "`code_graph` for usages of this target",
        '`code_graph` with `relations: ["callees"]` for outgoing calls from this target',
        "`code_impact` for blast radius",
      ],
    };
  }
  return { kind: "error", message: "**Error:** Unexpected resolution outcome." };
}
/** Resolve file-only (no coordinates) input. */
async function resolveFileOnlyInput(
  params: ResolveServiceParams,
  cwd: string,
  maxResults: number,
  provider: CodeProvider | null,
): Promise<ResolveServiceResult> {
  const file = params.file;
  if (!file) {
    return { kind: "error", message: "**Error:** File required for file-level resolution." };
  }
  const resolvedFile = normalizePath(file, cwd);
  if (!existsSync(resolvedFile)) {
    return { kind: "error", message: `**Error:** File not found: \`${file}\`` };
  }
  const outcome = await resolveFile(file, cwd, {
    semantic: provider ?? undefined,
    structural: provider ?? undefined,
  });
  if (outcome.kind === "error") {
    return { kind: "error", message: outcome.message };
  }
  const targets = outcome.group.targets
    .slice(0, maxResults)
    .map((t) =>
      registerFromTarget({ ...t, position: t.position, confidence: t.confidence }, cwd, "file"),
    );
  return {
    kind: "resolved",
    targets,
    confidence: outcome.group.confidence,
    omittedCount: Math.max(0, outcome.group.targets.length - maxResults),
    nextQueries: [
      "Use `targetId` with `code_graph` for reference tracking",
      "Use `targetId` with `code_impact` for blast radius",
    ],
  };
}
/** Handle a path-like query with kind: "file". */
async function resolvePathQuery(
  query: string,
  cwd: string,
  maxResults: number,
  provider: CodeProvider | null,
): Promise<ResolveServiceResult | null> {
  const candidatePath = resolvePathLikeQuery(query, cwd);
  if (!candidatePath) return null;
  const outcome = await resolveFile(candidatePath, cwd, {
    semantic: provider ?? undefined,
    structural: provider ?? undefined,
  });
  if (outcome.kind === "error") return null;
  const targets = outcome.group.targets
    .slice(0, maxResults)
    .map((t) =>
      registerFromTarget({ ...t, position: t.position, confidence: t.confidence }, cwd, "file"),
    );
  return {
    kind: "resolved",
    targets,
    confidence: outcome.group.confidence,
    omittedCount: Math.max(0, outcome.group.targets.length - maxResults),
    nextQueries: [
      "Use `targetId` with `code_graph` for reference tracking",
      "Use `targetId` with `code_impact` for blast radius",
    ],
  };
}
/** Resolve query/symbol input via semantic workspace symbols. */
async function resolveQueryTarget(opts: {
  query: string;
  kind: string | undefined;
  scope: string | undefined;
  cwd: string;
  provider: CodeProvider;
  maxResults: number;
}): Promise<ResolveServiceResult> {
  const { query, kind, scope, cwd, provider, maxResults } = opts;

  // Map public kind to internal options for resolveSymbol.
  // "symbol" means "any kind" (no filter). "export" maps to exportedOnly.
  const scopePath = scope ? resolve(cwd, scope) : undefined;
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
    const entry = registerFromTarget(outcome.target, cwd, "symbol");
    return {
      kind: "resolved",
      targets: [entry],
      confidence: entry.confidence,
      omittedCount: 0,
      nextQueries: [
        "`code_graph` for usages of this target",
        '`code_graph` with `relations: ["callees"]` for outgoing calls from this target',
        "`code_impact` for blast radius",
      ],
    };
  }
  // resolveSymbol never returns "group", so only disambiguation remains
  const disambig = outcome as Extract<TargetOutcome, { kind: "disambiguation" }>;
  const candidates = disambig.candidates.map((c) => registerCandidate(c, cwd));
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
  cwd: string,
): Promise<ResolveServiceResult> {
  const validationError = validateResolveParams(params);
  if (validationError) {
    return { kind: "error", message: validationError };
  }
  const providerState = getCodeProviderState(cwd);
  const provider = providerState.kind === "ready" ? providerState.provider : null;
  const maxResults = params.maxResults ?? 10;
  // Anchored resolution
  if (params.file && params.line != null && params.character != null) {
    return resolveAnchoredInput(params, cwd, maxResults);
  }
  // File-only resolution
  if (params.file && !params.query) {
    return resolveFileOnlyInput(params, cwd, maxResults, provider);
  }
  // Query resolution
  if (!params.query) {
    return {
      kind: "error",
      message: "**Error:** Provide a `query` or `file` for resolution.",
    };
  }
  // Special case: path-like query with kind file
  const pathResult = await tryPathLikeQuery(params, cwd, maxResults, provider);
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
    cwd,
    provider,
    maxResults,
  });
}

/** Attempt file-level resolution when query looks like a file path. */
async function tryPathLikeQuery(
  params: ResolveServiceParams,
  cwd: string,
  maxResults: number,
  provider: CodeProvider | null,
): Promise<ResolveServiceResult | null> {
  if (params.kind !== "file" && params.kind !== "File") return null;
  const query = params.query;
  if (!query || !isPathLike(query)) return null;
  return resolvePathQuery(query, cwd, maxResults, provider);
}
// ── Helpers ───────────────────────────────────────────────────────────
function isPathLike(query: string): boolean {
  return (
    query.includes("/") || query.includes("\\") || query.endsWith(".ts") || query.endsWith(".js")
  );
}
/**
 * Attempt to resolve a path-like query string to an absolute file path.
 * Returns null if the path cannot be resolved to an existing file.
 */
function resolvePathLikeQuery(query: string, cwd: string): string | null {
  const candidate = resolve(cwd, query);
  if (existsSync(candidate)) {
    return candidate;
  }
  for (const ext of [".ts", ".tsx", ".js", ".jsx", ".json", ".md"]) {
    const withExt = candidate + ext;
    if (existsSync(withExt)) return withExt;
  }
  return null;
}
