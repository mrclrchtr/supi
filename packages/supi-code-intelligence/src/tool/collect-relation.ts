/**
 * Per-relation data collection for code_graph.
 *
 * Extracted from execute-graph.ts to keep the graph executor focused on
 * orchestration. Each relation dispatches to a dedicated handler that
 * calls the appropriate substrate and renderer.
 */

import type { CallsResult } from "../analysis/calls/service.ts";
import { collectOutgoingCalls } from "../analysis/calls/service.ts";
import type { CodeProvider } from "../analysis/context/request-context.ts";
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
import { toDisplayPath } from "../analysis/search/helpers.ts";
import { renderCallsResult } from "../presentation/markdown/calls.ts";
import { renderImplementationsResult } from "../presentation/markdown/implementations.ts";
import { readNextAround, readNextRange } from "../presentation/markdown/read-next.ts";
import { renderReferencesResult } from "../presentation/markdown/references.ts";
import {
  type GraphSection,
  renderExportsResult,
  renderImportsResult,
} from "../presentation/markdown/relations.ts";
import type { AnchorKind } from "../session/target-store.ts";
import type { GraphRelation } from "./execute-graph.ts";

// ── Shared context passed to each relation handler ────────────────────

interface CollectionContext {
  file: string;
  position: { line: number; character: number };
  displayName: string;
  cwd: string;
  provider: CodeProvider | null;
  maxResults: number;
  anchorKind: AnchorKind;
  calleeDepth: "direct" | "deep";
}

// ── Dispatcher ────────────────────────────────────────────────────────

/** Options for {@link collectRelation}. */
export interface CollectRelationOptions {
  file: string;
  position: { line: number; character: number };
  displayName: string;
  cwd: string;
  provider: CodeProvider | null;
  maxResults: number;
  semanticReadinessError: string | null;
  anchorKind: AnchorKind;
  calleeDepth?: "direct" | "deep";
}

/**
 * Collect data for one graph relation. Dispatches to the handler for the
 * requested relation kind, gating semantic relations behind readiness.
 */
export async function collectRelation(
  rel: GraphRelation,
  opts: CollectRelationOptions,
): Promise<GraphSection> {
  if (opts.semanticReadinessError && (rel === "references" || rel === "implements")) {
    return { kind: "unavailable", rel, message: opts.semanticReadinessError };
  }

  const ctx: CollectionContext = {
    file: opts.file,
    position: opts.position,
    displayName: opts.displayName,
    cwd: opts.cwd,
    provider: opts.provider,
    maxResults: opts.maxResults,
    anchorKind: opts.anchorKind,
    calleeDepth: opts.calleeDepth ?? "direct",
  };

  try {
    const handler = RELATION_HANDLERS[rel];
    if (!handler) {
      return { kind: "not-implemented", rel, message: `Unknown relation: ${rel}` };
    }
    return handler(ctx);
  } catch (err) {
    return {
      kind: "unavailable",
      rel,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Relation handlers ─────────────────────────────────────────────────

async function collectReferencesRelation(ctx: CollectionContext): Promise<GraphSection> {
  const rel: GraphRelation = "references";
  if (!ctx.provider?.references) {
    return { kind: "unavailable", rel, message: "No semantic provider for references" };
  }
  const result: ReferencesResult = await collectReferences(
    ctx.file,
    ctx.position,
    ctx.displayName,
    { cwd: ctx.cwd, provider: { references: ctx.provider.references } },
  );
  if (result.confidence === "unavailable") {
    return { kind: "unavailable", rel, message: "No references available" };
  }
  const rendered = renderReferencesResult(
    ctx.displayName,
    result.references,
    result.externalCount,
    result.confidence,
    ctx.cwd,
    ctx.maxResults,
  );
  return {
    kind: "ok",
    rel,
    count: result.references.length,
    content: rendered.content,
    evidenceLists: rendered.evidenceList ? [rendered.evidenceList] : [],
    readNext: [
      readNextAround(
        toDisplayPath(ctx.cwd, ctx.file),
        ctx.position.line + 1,
        "inspect the resolved target before editing",
      ),
      ...result.references
        .slice(0, Math.min(2, ctx.maxResults))
        .map((ref) =>
          readNextAround(toDisplayPath(ctx.cwd, ref.file), ref.line, "inspect a reference site"),
        ),
    ],
  };
}

async function collectCalleesRelation(ctx: CollectionContext): Promise<GraphSection> {
  const rel: GraphRelation = "callees";
  if (ctx.anchorKind === "declaration") {
    return {
      kind: "unavailable",
      rel,
      message:
        "Cannot collect callees from a declaration anchor. Re-resolve the target to a name anchor, or pass file + line + character anchored on the identifier.",
    };
  }
  if (!ctx.provider?.calleesAt) {
    return { kind: "unavailable", rel, message: "No structural provider for callees" };
  }
  const result: CallsResult = await collectOutgoingCalls(
    ctx.file,
    ctx.position.line + 1,
    ctx.position.character + 1,
    ctx.displayName,
    { cwd: ctx.cwd, provider: { calleesAt: ctx.provider.calleesAt } },
    undefined,
    ctx.calleeDepth,
  );
  if (result.confidence === "unavailable") {
    return { kind: "unavailable", rel, message: "No callees available" };
  }
  const rendered = renderCallsResult(
    result.enclosingScope,
    result.calls,
    toDisplayPath(ctx.cwd, ctx.file),
    ctx.maxResults,
    result.depth,
  );
  return {
    kind: "ok",
    rel,
    count: result.calls.length,
    content: rendered.content,
    evidenceLists: rendered.evidenceList ? [rendered.evidenceList] : [],
    readNext: [
      readNextRange({
        file: toDisplayPath(ctx.cwd, ctx.file),
        startLine: result.enclosingScope.startLine ?? ctx.position.line + 1,
        endLine:
          result.enclosingScope.endLine ?? result.enclosingScope.startLine ?? ctx.position.line + 1,
        reason: `inspect enclosing scope \`${result.enclosingScope.name}\``,
      }),
    ],
  };
}

async function collectImplementationsRelation(ctx: CollectionContext): Promise<GraphSection> {
  const rel: GraphRelation = "implements";
  if (!ctx.provider?.implementation) {
    return { kind: "unavailable", rel, message: "No semantic provider for implementations" };
  }
  const result: ImplementationsResult = await collectServiceImplementations(
    ctx.file,
    ctx.position,
    ctx.displayName,
    { cwd: ctx.cwd, provider: { implementation: ctx.provider.implementation } },
    ctx.maxResults,
  );
  if (result.confidence === "unavailable") {
    return { kind: "unavailable", rel, message: "No implementations available" };
  }
  // Filter self-references: LSP returns the declaration itself as an
  // "implementation" for non-interface symbols. Drop the target location.
  const targetLine = ctx.position.line + 1;
  const filtered = result.implementations.filter(
    (impl) => !(impl.file === ctx.file && impl.line === targetLine),
  );
  const rendered = renderImplementationsResult(
    filtered,
    result.externalCount,
    ctx.cwd,
    ctx.maxResults,
    ctx.displayName,
  );
  return {
    kind: "ok",
    rel,
    count: filtered.length,
    content: rendered.content,
    evidenceLists: rendered.evidenceList ? [rendered.evidenceList] : [],
  };
}

async function collectImportsRelation(ctx: CollectionContext): Promise<GraphSection> {
  const rel: GraphRelation = "imports";
  if (!ctx.provider?.imports) {
    return { kind: "unavailable", rel, message: "No structural provider for imports" };
  }
  const importResult = await ctx.provider.imports(ctx.file);
  if (importResult.kind !== "success") {
    return { kind: "unavailable", rel, message: `Imports unavailable: ${importResult.kind}` };
  }
  const flatImports = importResult.data.map((entry) => ({
    moduleSpecifier: entry.moduleSpecifier,
    startLine: entry.startLine,
  }));
  const rendered = renderImportsResult(
    ctx.displayName,
    flatImports,
    toDisplayPath(ctx.cwd, ctx.file),
    ctx.maxResults,
  );
  return {
    kind: "ok",
    rel,
    count: flatImports.length,
    content: rendered.content,
    evidenceLists: rendered.evidenceList ? [rendered.evidenceList] : [],
  };
}

async function collectExportsRelation(ctx: CollectionContext): Promise<GraphSection> {
  const rel: GraphRelation = "exports";
  if (!ctx.provider?.exports) {
    return { kind: "unavailable", rel, message: "No structural provider for exports" };
  }
  const exportResult = await ctx.provider.exports(ctx.file);
  if (exportResult.kind !== "success") {
    return { kind: "unavailable", rel, message: `Exports unavailable: ${exportResult.kind}` };
  }
  const flatExports = exportResult.data.map((entry) => ({
    name: entry.name,
    kind: entry.kind,
    startLine: entry.startLine,
  }));
  const rendered = renderExportsResult(
    ctx.displayName,
    flatExports,
    toDisplayPath(ctx.cwd, ctx.file),
    ctx.maxResults,
  );
  return {
    kind: "ok",
    rel,
    count: flatExports.length,
    content: rendered.content,
    evidenceLists: rendered.evidenceList ? [rendered.evidenceList] : [],
  };
}

async function collectTestsRelation(ctx: CollectionContext): Promise<GraphSection> {
  const rel: GraphRelation = "tests";
  const discovery = await discoverTestFilesForSource(ctx.file, {
    references: ctx.provider?.references,
    outline: ctx.provider?.outline,
    cwd: ctx.cwd,
    cap: ctx.maxResults,
    position: ctx.position,
  });
  const tests = buildTestSurfaceDetails(
    { status: discovery.kind, provenance: discovery.provenance, files: discovery.files },
    ctx.cwd,
    ctx.maxResults,
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
  for (const testFile of tests.files.slice(0, 3)) {
    testLines.push(`- \`${testFile.file}\``);
    testLines.push(...renderRankedTestLabelsForMarkdown(testFile.labels, ctx.maxResults));
  }

  const provenanceNote = `, ${discovery.provenance}`;
  const content = `**Tests** (${discovery.files.length} companion file${discovery.files.length !== 1 ? "s" : ""}${provenanceNote})\n\n${testLines.join("\n")}\n`;
  return { kind: "ok", rel, count: discovery.files.length, content, tests };
}

// ── Handler dispatch table ────────────────────────────────────────────

/**
 * Handler dispatch table for concrete relation kinds.
 *
 * The `"all"` pseudo-relation is expanded into the individual kinds by
 * {@link expandAllRelations} in execute-graph.ts before iteration, so
 * `collectRelation` is never called with `"all"` at runtime. The table
 * is typed as a partial record to reflect this invariant.
 */
const RELATION_HANDLERS: Partial<
  Record<GraphRelation, (ctx: CollectionContext) => Promise<GraphSection>>
> = {
  references: collectReferencesRelation,
  callees: collectCalleesRelation,
  implements: collectImplementationsRelation,
  imports: collectImportsRelation,
  exports: collectExportsRelation,
  tests: collectTestsRelation,
};
