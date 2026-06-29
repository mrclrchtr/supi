/**
 * Graph orchestration use-case — unified relation-graph data collection.
 *
 * Resolves a target and collects per-relation data (references, callees,
 * imports, exports, implementations, tests) through the code provider.
 * Returns a rendered CodeIntelResult with structured details.
 *
 * Extracted from execute-graph.ts as part of the thin-executor normalization.
 */

import type { CodeProvider } from "../../analysis/provider.ts";
import { ensureSemanticReadiness } from "../../analysis/readiness.ts";
import { toDisplayPath } from "../../analysis/search/ripgrep.ts";
import { resolveTarget } from "../../analysis/target/bridge.ts";
import type { AnchorKind } from "../../session/target-store.ts";
import type { CodeIntelResult } from "../../types/index.ts";
import { searchErrorResult } from "../infra/error-results.ts";
import { emitToolProgress } from "../infra/progress.ts";
import { renderSemanticReadinessTimeout } from "../infra/readiness-message.ts";
import { type CollectRelationOptions, collectRelation } from "./collect-relation.ts";
import type { GraphRelation } from "./execute.ts";
import { renderGraphResult } from "./markdown-base.ts";

/** Relation kinds accepted by code_graph. */
export type { GraphRelation };

/** Default relation set when none specified. */
const DEFAULT_RELATIONS: GraphRelation[] = ["references"];

/** Relations that need semantic (LSP) readiness. */
const SEMANTIC_RELATIONS: GraphRelation[] = ["references", "implements"];

/** Relations that only need a file path, not a position. */
const FILE_LEVEL_RELATIONS: GraphRelation[] = ["imports", "exports"];

export interface GraphInput {
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
  _expandedAnchorKind?: AnchorKind;
}

export interface GraphDeps {
  cwd: string;
  session: import("../../session/session.ts").WorkspaceCodeIntelligenceSession;
  /** Ready code provider, or null. */
  provider: CodeProvider | null;
  /** Progress callback for long-running relation collection. */
  onUpdate?: import("@earendil-works/pi-coding-agent").AgentToolUpdateCallback;
}

/**
 * Execute the graph use-case.
 *
 * Resolves the target and collects all requested relations. The caller
 * (tool executor) has already validated params, expanded targetId, and
 * gated on capability availability.
 */
export async function executeGraph(input: GraphInput, deps: GraphDeps): Promise<CodeIntelResult> {
  const requestedRelations = input.relations ?? DEFAULT_RELATIONS;
  const relations = expandAllRelations(requestedRelations);

  // Semantic readiness — degrades per-relation rather than blocking.
  const requestedSemantic = relations.some((r) => SEMANTIC_RELATIONS.includes(r));
  let semanticReadinessError: string | null = null;
  if (requestedSemantic) {
    const readiness = await ensureSemanticReadiness(
      deps.cwd,
      input.file ? { kind: "file", file: input.file } : { kind: "workspace" },
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

  // Resolve target
  const target = await resolveGraphTarget(input, deps, allFileLevel);
  if ("content" in target) return target;

  const { resolvedFile, resolvedPosition, displayName, resolvedAnchorKind } = target;
  const resolvedDisplayFile = toDisplayPath(deps.cwd, resolvedFile);

  // Collect results per relation
  const sections = [];
  const maxResults = input.maxResults ?? 8;

  emitToolProgress(deps.onUpdate, `code_graph: collecting ${relations.length} relation(s)...`);

  for (const rel of relations) {
    if (relations.length > 1) {
      emitToolProgress(deps.onUpdate, `code_graph: ${rel}...`);
    }
    const opts: CollectRelationOptions = {
      file: resolvedFile,
      position: resolvedPosition,
      displayName,
      cwd: deps.cwd,
      provider: deps.provider,
      maxResults,
      semanticReadinessError,
      anchorKind: resolvedAnchorKind,
      calleeDepth: input.calleeDepth,
    };
    const section = await collectRelation(rel, opts);
    sections.push(section);
  }

  // Render combined output
  return buildGraphResult(displayName, sections, resolvedDisplayFile, input.scope);
}

// ── Target resolution ─────────────────────────────────────────────────

interface ResolvedGraphTarget {
  resolvedFile: string;
  resolvedPosition: { line: number; character: number };
  displayName: string;
  resolvedAnchorKind: AnchorKind;
}

async function resolveGraphTarget(
  input: GraphInput,
  deps: GraphDeps,
  allFileLevel: boolean,
): Promise<ResolvedGraphTarget | CodeIntelResult> {
  if (allFileLevel) {
    return resolveFileLevelTarget(input, deps);
  }
  return resolvePositionAnchoredTarget(input, deps);
}

async function resolveFileLevelTarget(
  input: GraphInput,
  deps: GraphDeps,
): Promise<ResolvedGraphTarget | CodeIntelResult> {
  if (input.file) {
    return {
      resolvedFile: input.file,
      resolvedPosition: { line: 1, character: 1 },
      displayName: toDisplayPath(deps.cwd, input.file),
      resolvedAnchorKind: "name",
    };
  }

  if (input.symbol) {
    const target = await resolveTarget(
      { symbol: input.symbol, path: input.scope },
      deps.cwd,
      deps.provider ?? undefined,
    );
    if (typeof target === "string") return searchErrorResult(target);
    if ("targets" in target) {
      return searchErrorResult(
        "**Error:** `code_graph` requires a precise target for file-level relations. Use `file` or `targetId` from `code_resolve`.",
      );
    }
    return {
      resolvedFile: target.file,
      resolvedPosition: { line: 1, character: 1 },
      displayName: toDisplayPath(deps.cwd, target.file),
      resolvedAnchorKind: "name",
    };
  }

  if (input.scope) {
    return searchErrorResult(
      "**Error:** `code_graph` file-level relations require a `file` or `symbol`, not just `scope`.",
    );
  }

  return searchErrorResult("**Error:** `code_graph` requires a target for file-level relations.");
}

async function resolvePositionAnchoredTarget(
  input: GraphInput,
  deps: GraphDeps,
): Promise<ResolvedGraphTarget | CodeIntelResult> {
  const target = await resolveTarget(
    {
      file: input.file,
      line: input.line,
      character: input.character,
      symbol: input.symbol,
      path: input.scope,
    },
    deps.cwd,
    deps.provider ?? undefined,
  );
  if (typeof target === "string") return searchErrorResult(target);

  if ("targets" in target) {
    return searchErrorResult(
      "**Error:** `code_graph` requires a precise target. Use anchored coordinates (`file`, `line`, `character`), `symbol`, or pass a `targetId` from `code_resolve`.",
    );
  }

  const resolvedAnchorKind = input._expandedAnchorKind ?? target.anchorKind;
  const displayName =
    input._expandedName ??
    target.name ??
    `symbol at ${toDisplayPath(deps.cwd, target.file)}:${target.displayLine}`;

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
  sections: Awaited<ReturnType<typeof collectRelation>>[],
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

function expandAllRelations(relations: GraphRelation[]): GraphRelation[] {
  if (!relations.includes("all")) {
    return relations;
  }
  return ["references", "callees", "imports", "exports", "implements", "tests"];
}
