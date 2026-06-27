/**
 * Tool executor for code_graph.
 *
 * Unified relation-graph tool — replaces code_references, code_calls,
 * and code_implementations. Resolves one target, then dispatches to the
 * appropriate analysis service per requested relation.
 */

import type { CodeProvider } from "../analysis/context/request-context.ts";
import { toDisplayPath } from "../analysis/search/helpers.ts";
import {
  type GraphRelationKind,
  type GraphSection,
  renderGraphResult,
} from "../presentation/markdown/relations.ts";
import type { AnchorKind } from "../session/target-store.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../types.ts";
import { collectRelation } from "./collect-relation.ts";
import { composeRules, focusedToolRules, requireAtLeastOne } from "./cross-field.ts";
import {
  expandTargetId,
  gateCapability,
  resolveScopeParam,
  runPipe,
  validateParams,
} from "./pipeline.ts";
import { emitToolProgress } from "./progress.ts";
import { ensureSemanticReadiness, renderSemanticReadinessTimeout } from "./semantic-readiness.ts";

/** Relation kinds accepted by code_graph — re-exported from relations renderer. */
export type GraphRelation = GraphRelationKind;

/** Default relation set when none specified. */
const DEFAULT_RELATIONS: GraphRelation[] = ["references"];

/** Relations that need semantic (LSP) readiness. */
const SEMANTIC_RELATIONS: GraphRelation[] = ["references", "implements"];

/** Relations that only need a file path, not a position. */
const FILE_LEVEL_RELATIONS: GraphRelation[] = ["imports", "exports"];

export interface CodeGraphToolParams {
  targetId?: string;
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  scope?: string;
  relations?: GraphRelation[];
  calleeDepth?: "direct" | "deep";
  maxResults?: number;
  /** Set by pipeline expandTargetId stage. */
  _expandedName?: string | null;
  /** Set by pipeline expandTargetId stage. */
  _expandedAnchorKind?: string | null;
}

export async function executeGraphTool(
  params: CodeGraphToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  emitToolProgress(ctx.onUpdate, "code_graph: resolving target...");

  const requestedRelations = params.relations ?? DEFAULT_RELATIONS;
  const relations = expandAllRelations(requestedRelations);

  return runPipe(
    params,
    ctx,
    [
      expandTargetId((msg) => errorResult(msg)),
      resolveScopeParam((reason) => errorResult(`**Error:** ${reason}`)),
      validateParams(
        composeRules(focusedToolRules(), requireAtLeastOne("file", "symbol", "scope")),
        (msg) => errorResult(msg),
      ),
      gateCapability("code_graph"),
    ],
    (p, c) => runGraphQueries(p, c, relations),
  );
}

// ── Core execution (extracted from runPipe callback) ──────────────────

/**
 * Run graph queries after pipeline gates have passed.
 *
 * Handles semantic readiness (best-effort per relation), target resolution
 * (file-level vs position-anchored), per-relation data collection, and
 * combined output rendering.
 */
async function runGraphQueries(
  p: CodeGraphToolParams,
  c: CodeIntelToolExecCtx,
  relations: GraphRelation[],
): Promise<CodeIntelResult> {
  // Semantic readiness — degrades per-relation rather than blocking the tool.
  const requestedSemantic = relations.some((r) => SEMANTIC_RELATIONS.includes(r));
  let semanticReadinessError: string | null = null;
  if (requestedSemantic) {
    const readiness = await ensureSemanticReadiness(
      c.cwd,
      p.file ? { kind: "file", file: p.file } : { kind: "workspace" },
    );
    if (readiness.kind === "timeout") {
      semanticReadinessError = renderSemanticReadinessTimeout("code_graph", 15_000);
    } else if (readiness.kind === "unavailable") {
      semanticReadinessError =
        "No analysis provider is available for this workspace. Check `code_health` for LSP and tree-sitter status.";
    }
  }

  const allFileLevel =
    relations.length > 0 && relations.every((r) => FILE_LEVEL_RELATIONS.includes(r));

  const providerState = c.session.getProviders();
  const provider = providerState.kind === "ready" ? providerState.provider : null;

  // ── Resolve target ──────────────────────────────────────────────────
  const target = await resolveGraphTarget(p, c, provider, allFileLevel);
  if (isErrorResult(target)) return target;

  const { resolvedFile, resolvedPosition, displayName, resolvedAnchorKind } = target;
  const resolvedDisplayFile = toDisplayPath(c.cwd, resolvedFile);

  // ── Collect results per relation ────────────────────────────────────
  const sections: GraphSection[] = [];
  const maxResults = p.maxResults ?? 8;

  emitToolProgress(c.onUpdate, `code_graph: collecting ${relations.length} relation(s)...`);

  for (const rel of relations) {
    if (relations.length > 1) {
      emitToolProgress(c.onUpdate, `code_graph: ${rel}...`);
    }
    const section = await collectRelation(rel, {
      file: resolvedFile,
      position: resolvedPosition,
      displayName,
      cwd: c.cwd,
      provider,
      maxResults,
      semanticReadinessError,
      anchorKind: resolvedAnchorKind,
      calleeDepth: p.calleeDepth,
    });
    sections.push(section);
  }

  // ── Render combined output ──────────────────────────────────────────
  return buildGraphResult(displayName, sections, resolvedDisplayFile, p.scope);
}

// ── Target resolution ─────────────────────────────────────────────────

interface ResolvedGraphTarget {
  resolvedFile: string;
  resolvedPosition: { line: number; character: number };
  displayName: string;
  resolvedAnchorKind: AnchorKind;
}

function isErrorResult(value: ResolvedGraphTarget | CodeIntelResult): value is CodeIntelResult {
  return "content" in value;
}

async function resolveGraphTarget(
  p: CodeGraphToolParams,
  c: CodeIntelToolExecCtx,
  provider: CodeProvider | null,
  allFileLevel: boolean,
): Promise<ResolvedGraphTarget | CodeIntelResult> {
  if (allFileLevel) {
    return resolveFileLevelTarget(p, c, provider);
  }
  return resolvePositionAnchoredTarget(p, c, provider);
}

async function resolveFileLevelTarget(
  p: CodeGraphToolParams,
  c: CodeIntelToolExecCtx,
  provider: CodeProvider | null,
): Promise<ResolvedGraphTarget | CodeIntelResult> {
  if (p.file) {
    return {
      resolvedFile: p.file,
      resolvedPosition: { line: 1, character: 1 },
      displayName: toDisplayPath(c.cwd, p.file),
      resolvedAnchorKind: "name",
    };
  }

  if (p.symbol) {
    const { resolveTarget } = await import("../targeting/resolve-target.ts");
    const target = await resolveTarget({ ...p, path: p.scope }, c.cwd, provider ?? undefined);
    if (typeof target === "string") return errorResult(target);
    if ("targets" in target) {
      return errorResult(
        "**Error:** `code_graph` requires a precise target for file-level relations. Use `file` or `targetId` from `code_resolve`.",
      );
    }
    return {
      resolvedFile: target.file,
      resolvedPosition: { line: 1, character: 1 },
      displayName: toDisplayPath(c.cwd, target.file),
      resolvedAnchorKind: "name",
    };
  }

  if (p.scope) {
    return errorResult(
      "**Error:** `code_graph` file-level relations require a `file` or `symbol`, not just `scope`.",
    );
  }

  return errorResult("**Error:** `code_graph` requires a target for file-level relations.");
}

async function resolvePositionAnchoredTarget(
  p: CodeGraphToolParams,
  c: CodeIntelToolExecCtx,
  provider: CodeProvider | null,
): Promise<ResolvedGraphTarget | CodeIntelResult> {
  const { resolveTarget } = await import("../targeting/resolve-target.ts");
  const target = await resolveTarget({ ...p, path: p.scope }, c.cwd, provider ?? undefined);
  if (typeof target === "string") return errorResult(target);

  if ("targets" in target) {
    return {
      content:
        "**Error:** `code_graph` requires a precise target. Use anchored coordinates (`file`, `line`, `character`), `symbol`, or pass a `targetId` from `code_resolve`.",
      details: {
        type: "search",
        data: {
          confidence: "unavailable",
          scope: null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: [],
        },
      },
    };
  }

  const resolvedAnchorKind = (p._expandedAnchorKind as AnchorKind | undefined) ?? target.anchorKind;
  const displayName =
    p._expandedName ??
    target.name ??
    `symbol at ${toDisplayPath(c.cwd, target.file)}:${target.displayLine}`;

  return {
    resolvedFile: target.file,
    resolvedPosition: target.position,
    displayName,
    resolvedAnchorKind,
  };
}

// ── Result assembly ───────────────────────────────────────────────────

function buildGraphResult(
  displayName: string,
  sections: GraphSection[],
  resolvedDisplayFile: string,
  scope: string | undefined,
): CodeIntelResult {
  const content = renderGraphResult(displayName, sections, resolvedDisplayFile);

  const hasStructural = sections.some(
    (s) =>
      s.kind === "ok" &&
      (s.rel === "callees" ||
        s.rel === "imports" ||
        s.rel === "exports" ||
        (s.rel === "tests" && s.count > 0)),
  );
  const hasSemantic = sections.some(
    (s) => s.kind === "ok" && (s.rel === "references" || s.rel === "implements"),
  );
  const confidence = hasSemantic ? "semantic" : hasStructural ? "structural" : "unavailable";

  const tests = sections.find((section) => section.rel === "tests")?.tests;
  const evidenceLists = sections.flatMap((section) =>
    section.kind === "ok" ? (section.evidenceLists ?? []) : [],
  );
  const omittedCount = evidenceLists.reduce(
    (sum, evidenceList) => sum + (evidenceList.omittedCount ?? 0),
    0,
  );

  return {
    content,
    details: {
      type: "search",
      data: {
        confidence,
        scope: scope ?? null,
        candidateCount: sections.reduce((sum, s) => (s.kind === "ok" ? sum + s.count : sum), 0),
        omittedCount,
        evidenceLists,
        nextQueries: [
          "`code_orientation` on individual results for deeper orientation",
          "`code_impact` for impact analysis",
        ],
        tests,
      },
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

function errorResult(content: string): CodeIntelResult {
  return {
    content,
    details: {
      type: "search",
      data: {
        confidence: "unavailable",
        scope: null,
        candidateCount: 0,
        omittedCount: 0,
        nextQueries: [],
      },
    },
  };
}

function expandAllRelations(relations: GraphRelation[]): GraphRelation[] {
  if (!relations.includes("all")) {
    return relations;
  }
  return ["references", "callees", "imports", "exports", "implements", "tests"];
}
