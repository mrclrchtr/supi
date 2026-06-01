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
import { toDisplayPath } from "../search-helpers.ts";
import type { CodeIntelResult } from "../types.ts";
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
  path?: string;
  relations?: GraphRelation[];
  direction?: "in" | "out" | "both";
  depth?: number;
  maxNodes?: number;
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

  // ── 2. Validate params ──────────────────────────────────────────────
  const error = validateFocusedToolParams(params, ctx.cwd);
  if (error) {
    return errorResult(error);
  }

  // Must have targetId, anchored coords, or symbol
  if (!params.file && !params.symbol) {
    return errorResult(
      "**Error:** `code_graph` requires a target. Provide `targetId` (from `code_resolve`), `file` + `line` + `character`, or a `symbol`.",
    );
  }

  // ── 3. Normalize relations ──────────────────────────────────────────
  const relations = params.relations ?? DEFAULT_RELATIONS;

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

  // ── 5. Resolve target once ──────────────────────────────────────────
  const { resolveTarget } = await import("../analysis/targeting/resolve-target.ts");
  const target = await resolveTarget(params, ctx.cwd, provider ?? undefined);
  if (typeof target === "string") {
    return { content: target, details: undefined };
  }

  // File-level disambiguation — not supported for graph
  if ("targets" in target) {
    return {
      content:
        "**Error:** `code_graph` requires a precise target. Use anchored coordinates (`file`, `line`, `character`) or pass a `targetId` from `code_resolve`.",
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

  const resolvedFile = target.file;
  const resolvedPosition = target.position;
  const resolvedDisplayFile = toDisplayPath(ctx.cwd, resolvedFile);
  const displayName =
    target.name ?? expandedTargetName ?? `symbol at ${resolvedDisplayFile}:${target.displayLine}`;

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
    );
    sections.push(section);
  }

  // ── 7. Render combined output ───────────────────────────────────────
  const content = renderGraphResult(displayName, sections, resolvedDisplayFile);

  // Derive confidence from the highest-capability successful section
  const hasStructural = sections.some(
    (s) => s.kind === "ok" && (s.rel === "callees" || s.rel === "imports" || s.rel === "exports"),
  );
  const hasSemantic = sections.some(
    (s) => s.kind === "ok" && (s.rel === "references" || s.rel === "implements"),
  );
  const confidence: "semantic" | "structural" | "unavailable" = hasSemantic
    ? "semantic"
    : hasStructural
      ? "structural"
      : "unavailable";

  return {
    content,
    details: {
      type: "search" as const,
      data: {
        confidence,
        scope: params.path ?? null,
        candidateCount: sections.reduce((sum, s) => {
          if (s.kind === "ok") return sum + s.count;
          return sum;
        }, 0),
        omittedCount: 0,
        nextQueries: [
          "`code_context` on individual results for deeper context",
          "`code_impact` for impact analysis",
        ],
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
): Promise<GraphSection> {
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
        const content = renderImplementationsResult(
          result.implementations,
          result.externalCount,
          cwd,
          maxResults,
          displayName,
        );
        return { kind: "ok", rel, count: result.implementations.length, content };
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

      case "tests":
        return {
          kind: "not-implemented" as const,
          rel,
          message: `\`${rel}\` relation is not yet implemented.`,
        };

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
