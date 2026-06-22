// biome-ignore-all lint/style/noExcessiveLinesPerFile: relation dispatch for 7 relation kinds stays together
// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: relation dispatch naturally spans cases — pre-existing, split in later phase
/**
 * Tool executor for code_graph.
 *
 * Unified relation-graph tool — replaces code_references, code_calls,
 * and code_implementations. Resolves one target, then dispatches to the
 * appropriate analysis service per requested relation.
 */

import type { CallsResult } from "../analysis/calls/service.ts";
import { collectOutgoingCalls } from "../analysis/calls/service.ts";
import { type CodeProvider, getCodeProvider } from "../analysis/context/request-context.ts";
import {
  collectServiceImplementations,
  type ImplementationsResult,
} from "../analysis/implementations/service.ts";
import { collectReferences, type ReferencesResult } from "../analysis/references/service.ts";
import {
  buildTestSurfaceDetails,
  discoverTestFilesForSource,
  renderRankedTestLabelsForMarkdown,
} from "../analysis/relations/tests.ts";
import { routeFor } from "../analysis/routing/planner.ts";
import { renderCallsResult } from "../presentation/markdown/calls.ts";
import { renderImplementationsResult } from "../presentation/markdown/implementations.ts";
import { renderReferencesResult } from "../presentation/markdown/references.ts";
import {
  type GraphRelationKind,
  type GraphSection,
  renderExportsResult,
  renderGraphResult,
  renderImportsResult,
} from "../presentation/markdown/relations.ts";
import { resolveScope, toDisplayPath } from "../search-helpers.ts";
import type { CodeIntelResult } from "../types.ts";
import { ensureSemanticReadiness, renderSemanticReadinessTimeout } from "./semantic-readiness.ts";
import { expandTargetId } from "./target-id-params.ts";
import { validateFocusedToolParams } from "./validation.ts";

/** Relation kinds accepted by code_graph — re-exported from relations renderer. */
export type GraphRelation = GraphRelationKind;

/** Default relation set when none specified. */
const DEFAULT_RELATIONS: GraphRelation[] = ["references"];

export interface CodeGraphToolParams {
  targetId?: string;
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  scope?: string;
  relations?: GraphRelation[];
  maxResults?: number;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestration with multi-stage resolution, relation dispatch, and confidence derivation
export async function executeGraphTool(
  params: CodeGraphToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  // ── 1. Expand targetId ──────────────────────────────────────────────
  const expansion = expandTargetId(params, ctx.cwd);
  const expandedTargetName = expansion.kind === "ok" ? expansion.targetName : null;
  if (expansion.kind === "error") {
    return errorResult(expansion.message);
  }
  if (expansion.kind === "ok") {
    params.file = expansion.file;
    params.line = expansion.line;
    params.character = expansion.character;
  }

  // ── 2. Resolve scope and validate params ─────────────────────────────
  const scopeResolution = resolveScope(params.scope, ctx.cwd);
  if (scopeResolution.kind === "error") {
    return errorResult(`**Error:** ${scopeResolution.reason}`);
  }
  const resolvedScope = params.scope ? scopeResolution.path : undefined;

  // Map public `scope` to internal `path` for shared validation
  const internalParams = { ...params, path: resolvedScope };
  const error = validateFocusedToolParams(internalParams, ctx.cwd);
  if (error) {
    return errorResult(error);
  }

  // Must have targetId, anchored coords, or symbol (file-level relations only need file)
  if (!params.file && !params.symbol && !params.scope) {
    return errorResult(
      "**Error:** `code_graph` requires a target. Provide `targetId` (from `code_resolve`), `file` + `line` + `character`, or `symbol`. Optionally pass `scope` to narrow results.",
    );
  }

  // ── 3. Normalize relations ──────────────────────────────────────────
  const requestedRelations = params.relations ?? DEFAULT_RELATIONS;
  const relations = expandAllRelations(requestedRelations);
  const semanticRelations: GraphRelation[] = ["references", "implements"];
  const requestedSemanticRelations = relations.filter((r: GraphRelation) =>
    semanticRelations.includes(r),
  );
  const needsSemanticRelations = requestedSemanticRelations.length > 0;

  let semanticReadinessError: string | null = null;
  if (needsSemanticRelations) {
    const readiness = await ensureSemanticReadiness(
      ctx.cwd,
      params.file ? { kind: "file", file: params.file } : { kind: "workspace" },
    );
    if (readiness.kind === "timeout") {
      semanticReadinessError = renderSemanticReadinessTimeout("code_graph", 15_000);
    } else if (readiness.kind === "unavailable") {
      semanticReadinessError =
        "No analysis provider is available for this workspace. Check `code_health` for LSP and tree-sitter status.";
    }
  }

  // File-level relations (imports/exports) don't need a position — bare `file` is sufficient.
  const FILE_LEVEL_RELATIONS: GraphRelation[] = ["imports", "exports"];
  const allFileLevel =
    relations.length > 0 && relations.every((r: GraphRelation) => FILE_LEVEL_RELATIONS.includes(r));

  // ── 4. Check provider availability ──────────────────────────────────
  const route = routeFor(ctx.cwd, "code_graph");
  if (route.preferred === "unavailable") {
    return {
      content:
        "**Error:** No analysis provider is available for this workspace. Check `code_health` for LSP and tree-sitter status.",
      details: {
        type: "search" as const,
        data: {
          confidence: "unavailable" as const,
          scope: null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: ["Check `code_health` for provider status"],
        },
      },
    };
  }

  const providerState = getCodeProvider(ctx.cwd);
  const provider = providerState.kind === "ready" ? providerState.provider : null;

  // ── 5. Resolve target once (skip for file-level-only relations) ─────
  let resolvedFile: string;
  let resolvedPosition: { line: number; character: number };
  let displayName: string;

  if (allFileLevel) {
    // File-level relations only need the file path — resolve symbol/scope to file if needed.
    if (params.file) {
      resolvedFile = params.file;
    } else if (params.symbol) {
      // Resolve symbol to file via the targeting pipeline
      const { resolveTarget } = await import("../analysis/targeting/resolve-target.ts");
      const target = await resolveTarget(
        { ...params, path: resolvedScope },
        ctx.cwd,
        provider ?? undefined,
      );
      if (typeof target === "string") {
        return errorResult(target);
      }
      if ("targets" in target) {
        return errorResult(
          "**Error:** `code_graph` requires a precise target for file-level relations. Use `file` or `targetId` from `code_resolve`.",
        );
      }
      resolvedFile = target.file;
    } else if (params.scope) {
      // Scope alone isn't a file — error
      return errorResult(
        "**Error:** `code_graph` file-level relations require a `file` or `symbol`, not just `scope`.",
      );
    } else {
      return errorResult("**Error:** `code_graph` requires a target for file-level relations.");
    }
    resolvedPosition = { line: 1, character: 1 };
    displayName = expandedTargetName ?? toDisplayPath(ctx.cwd, resolvedFile);
  } else {
    const { resolveTarget } = await import("../analysis/targeting/resolve-target.ts");
    const target = await resolveTarget(
      { ...params, path: resolvedScope },
      ctx.cwd,
      provider ?? undefined,
    );
    if (typeof target === "string") {
      return errorResult(target);
    }

    // File-level disambiguation — not supported for graph
    if ("targets" in target) {
      return {
        content:
          "**Error:** `code_graph` requires a precise target. Use anchored coordinates (`file`, `line`, `character`), `symbol`, or pass a `targetId` from `code_resolve`.",
        details: {
          type: "search" as const,
          data: {
            confidence: "unavailable" as const,
            scope: null,
            candidateCount: 0,
            omittedCount: 0,
            nextQueries: [],
          },
        },
      };
    }

    resolvedFile = target.file;
    resolvedPosition = target.position;
    displayName =
      target.name ??
      expandedTargetName ??
      `symbol at ${toDisplayPath(ctx.cwd, resolvedFile)}:${target.displayLine}`;
  }

  const resolvedDisplayFile = toDisplayPath(ctx.cwd, resolvedFile);

  // ── 6. Collect results per relation ─────────────────────────────────
  const sections: GraphSection[] = [];
  const maxResults = params.maxResults ?? 8;

  for (const rel of relations) {
    const section = await collectRelation(
      rel,
      resolvedFile,
      resolvedPosition,
      displayName,
      ctx.cwd,
      provider,
      maxResults,
      semanticReadinessError,
    );
    sections.push(section);
  }

  // ── 7. Render combined output ───────────────────────────────────────
  const content = renderGraphResult(displayName, sections, resolvedDisplayFile);

  // Derive confidence from the highest-capability successful section
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
  const confidence: "semantic" | "structural" | "unavailable" = hasSemantic
    ? "semantic"
    : hasStructural
      ? "structural"
      : "unavailable";

  const tests = sections.find((section) => section.rel === "tests")?.tests;

  return {
    content,
    details: {
      type: "search" as const,
      data: {
        confidence,
        scope: params.scope ?? null,
        candidateCount: sections.reduce((sum, s) => {
          if (s.kind === "ok") return sum + s.count;
          return sum;
        }, 0),
        omittedCount: 0,
        nextQueries: [
          "`code_context` on individual results for deeper context",
          "`code_impact` for impact analysis",
        ],
        tests,
      },
    },
  };
}

// ── Per-relation data collection ──────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: relation dispatch naturally spans cases
// biome-ignore lint/complexity/useMaxParams: orchestration needs target + provider + config
async function collectRelation(
  rel: GraphRelation,
  file: string,
  position: { line: number; character: number },
  displayName: string,
  cwd: string,
  provider: CodeProvider | null,
  maxResults: number,
  semanticReadinessError: string | null,
): Promise<GraphSection> {
  if (semanticReadinessError && (rel === "references" || rel === "implements")) {
    return { kind: "unavailable", rel, message: semanticReadinessError };
  }

  try {
    switch (rel) {
      case "references": {
        if (!provider?.references) {
          return { kind: "unavailable", rel, message: "No semantic provider for references" };
        }
        const result: ReferencesResult = await collectReferences(
          file,
          position,
          displayName,
          { cwd, provider: { references: provider.references } },
          maxResults,
        );
        if (result.confidence === "unavailable") {
          return { kind: "unavailable", rel, message: "No references available" };
        }
        const content = renderReferencesResult(
          displayName,
          result.references,
          result.externalCount,
          result.confidence,
          cwd,
          maxResults,
        );
        return { kind: "ok", rel, count: result.references.length, content };
      }

      case "callees": {
        if (!provider?.calleesAt) {
          return { kind: "unavailable", rel, message: "No structural provider for callees" };
        }
        const result: CallsResult = await collectOutgoingCalls(
          file,
          position.line + 1,
          position.character + 1,
          displayName,
          { cwd, provider: { calleesAt: provider.calleesAt } },
          maxResults,
        );
        if (result.confidence === "unavailable") {
          return { kind: "unavailable", rel, message: "No callees available" };
        }
        const calleeContent = renderCallsResult(
          result.enclosingScopeName,
          result.calls,
          toDisplayPath(cwd, file),
          maxResults,
        );
        return { kind: "ok", rel, count: result.calls.length, content: calleeContent };
      }

      case "implements": {
        if (!provider?.implementation) {
          return { kind: "unavailable", rel, message: "No semantic provider for implementations" };
        }
        const result: ImplementationsResult = await collectServiceImplementations(
          file,
          position,
          displayName,
          { cwd, provider: { implementation: provider.implementation } },
          maxResults,
        );
        if (result.confidence === "unavailable") {
          return { kind: "unavailable", rel, message: "No implementations available" };
        }
        // Filter self-references: LSP returns the declaration itself as an
        // "implementation" for non-interface symbols. Drop the target location.
        const targetLine = position.line + 1;
        const filtered = result.implementations.filter(
          (impl) => !(impl.file === file && impl.line === targetLine),
        );
        const content = renderImplementationsResult(
          filtered,
          result.externalCount,
          cwd,
          maxResults,
          displayName,
        );
        return { kind: "ok", rel, count: filtered.length, content };
      }

      case "imports": {
        if (!provider?.imports) {
          return { kind: "unavailable", rel, message: "No structural provider for imports" };
        }
        const importResult = await provider.imports(file);
        if (importResult.kind !== "success") {
          return { kind: "unavailable", rel, message: `Imports unavailable: ${importResult.kind}` };
        }
        const flatImports = importResult.data.map((entry) => ({
          moduleSpecifier: entry.moduleSpecifier,
          startLine: entry.startLine,
        }));
        const importContent = renderImportsResult(
          displayName,
          flatImports,
          toDisplayPath(cwd, file),
          maxResults,
        );
        return { kind: "ok", rel, count: flatImports.length, content: importContent };
      }

      case "exports": {
        if (!provider?.exports) {
          return { kind: "unavailable", rel, message: "No structural provider for exports" };
        }
        const exportResult = await provider.exports(file);
        if (exportResult.kind !== "success") {
          return { kind: "unavailable", rel, message: `Exports unavailable: ${exportResult.kind}` };
        }
        const flatExports = exportResult.data.map((entry) => ({
          name: entry.name,
          kind: entry.kind,
          startLine: entry.startLine,
        }));
        const exportContent = renderExportsResult(
          displayName,
          flatExports,
          toDisplayPath(cwd, file),
          maxResults,
        );
        return { kind: "ok", rel, count: flatExports.length, content: exportContent };
      }

      case "tests": {
        const discovery = await discoverTestFilesForSource(file, {
          references: provider?.references,
          outline: provider?.outline,
          cwd,
          cap: maxResults,
          position,
        });
        const tests = buildTestSurfaceDetails(
          {
            status: discovery.kind,
            provenance: discovery.provenance,
            files: discovery.files,
          },
          cwd,
          maxResults,
        );

        if (discovery.kind === "unavailable") {
          return {
            kind: "unavailable",
            rel,
            message: "No test provider available — semantic and structural providers are absent",
            tests,
          };
        }

        if (discovery.kind === "empty") {
          return {
            kind: "ok",
            rel,
            count: 0,
            content: `**Tests** — no companion test files found.\n`,
            tests,
          };
        }

        const testLines: string[] = [];
        const filesToScan = tests.files.slice(0, 3);
        for (const testFile of filesToScan) {
          testLines.push(`- \`${testFile.file}\``);
          testLines.push(...renderRankedTestLabelsForMarkdown(testFile.labels, maxResults));
        }

        const provenanceNote = `, ${discovery.provenance}`;
        const content = `**Tests** (${discovery.files.length} companion file${discovery.files.length !== 1 ? "s" : ""}${provenanceNote})\n\n${testLines.join("\n")}\n`;
        return {
          kind: "ok",
          rel,
          count: discovery.files.length,
          content,
          tests,
        };
      }

      default:
        return { kind: "not-implemented", rel, message: `Unknown relation: ${rel}` };
    }
  } catch (err) {
    return {
      kind: "unavailable",
      rel,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function errorResult(content: string): CodeIntelResult {
  return {
    content,
    details: {
      type: "search" as const,
      data: {
        confidence: "unavailable" as const,
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
