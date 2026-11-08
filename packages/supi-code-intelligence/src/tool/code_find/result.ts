import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import {
  createEvidenceList,
  createPartialEvidenceList,
  type EvidenceListMetadata,
} from "../../analysis/evidence.ts";
import {
  describeExcludedPath,
  describePartialQuery,
  displayAutomaticPathExclusion,
} from "../../analysis/search/exclusions.ts";
import { toDisplayPath } from "../../analysis/search/paths.ts";
import type { FindMode, FindWorkflowOutcome } from "../../session/find-types.ts";
import {
  assembledNextQueries,
  assembleToolResult,
  type ResultProvenance,
  type ToolResultAssembly,
} from "../result/assembly.ts";
import { createToolDisplaySection } from "../result/display.ts";
import type { SearchDetails, ToolDisplaySection } from "../result/types.ts";

/** Presentation-neutral assembled find result. */
export interface FindResultAssembly {
  outcome: Extract<FindWorkflowOutcome, { kind: "completed" }>;
  assembled: ToolResultAssembly<Extract<FindWorkflowOutcome, { kind: "completed" }>["data"]>;
  details: SearchDetails;
  displaySections: readonly ToolDisplaySection[];
}

/** Assemble one completed code-aware search outcome before presentation. */
export function assembleFindWorkflowResult(
  input: Extract<FindWorkflowOutcome, { kind: "completed" }>,
  cwd: string,
): FindResultAssembly {
  const outcome = withDisplayPaths(input, cwd);
  const exclusion =
    outcome.data.kind === "semantic"
      ? displayAutomaticPathExclusion(outcome.data.partialMetadata?.automaticPathExclusion, cwd)
      : undefined;
  const evidence = createFindEvidence(outcome);
  const confidence: ConfidenceMode = outcome.data.kind === "semantic" ? "semantic" : "structural";
  const nextQueries = findNextQueries(outcome);
  const provenance = findProvenance(outcome.data.kind);
  const assembled = assembleToolResult({
    data: outcome.data,
    sections: [
      {
        key: `find.${outcome.data.kind}`,
        title: `${outcome.data.kind} matches`,
        status: evidence.metadata.partialReason ? "partial" : "complete",
        items: findItems(outcome.data),
        confidence,
        provenance,
      },
    ],
    evidenceLists: [evidence.metadata],
    nextQueries,
    candidateCount: evidence.total,
    confidence,
    provenance,
  });

  const displaySections = [
    createToolDisplaySection({
      key: `find.${outcome.data.kind}`,
      title: outcome.data.kind === "semantic" ? "Symbols" : "Matches",
      items: findItems(outcome.data),
      totalCount: evidence.metadata.totalCount,
      omittedCount: evidence.metadata.omittedCount,
      partialReason: evidence.metadata.partialReason,
      format: (item) => formatFindDisplayItem(outcome.data.kind, item),
    }),
  ];

  if (exclusion?.examples.length) {
    displaySections.push(
      createToolDisplaySection({
        key: "find.excludedPaths",
        title: "Excluded path examples",
        items: exclusion.examples,
        totalCount: exclusion.examples.length,
        omittedCount: 0,
        format: describeExcludedPath,
      }),
    );
  }

  return {
    outcome,
    assembled,
    displaySections,
    details: {
      confidence,
      scope: outcome.scopeLabel === "." ? null : outcome.scopeLabel,
      candidateCount: evidence.total,
      omittedCount: assembled.totals.omittedCount,
      evidenceLists: [...assembled.evidenceLists],
      nextQueries: assembledNextQueries(assembled),
      ...(outcome.data.kind === "ast"
        ? {
            scan: outcome.data.result.scan,
            astMatches: [...outcome.data.result.matches],
            structuralFailures: [...outcome.data.result.failures],
          }
        : {}),
      ...(exclusion ? { automaticPathExclusion: exclusion } : {}),
    },
  };
}

/** Clone source-path projections for all output adapters without changing workflow facts. */
function withDisplayPaths(
  outcome: Extract<FindWorkflowOutcome, { kind: "completed" }>,
  cwd: string,
): Extract<FindWorkflowOutcome, { kind: "completed" }> {
  const display = (file: string) => toDisplayPath(cwd, file);
  const { data } = outcome;
  if (data.kind === "semantic") {
    return {
      ...outcome,
      data: {
        ...data,
        symbols: data.symbols.map((symbol) => ({ ...symbol, file: display(symbol.file) })),
        partialReason: data.partialReason
          ? describePartialQuery(data.partialReason, data.partialMetadata, cwd)
          : null,
      },
    };
  }
  const { result } = data;
  return {
    ...outcome,
    data: {
      ...data,
      result: {
        ...result,
        matches: result.matches.map((match) => ({ ...match, file: display(match.file) })),
        failures: result.failures.map((failure) => ({ ...failure, file: display(failure.file) })),
        scan: {
          ...result.scan,
          roots: result.scan.roots.map(display),
          exclusions: result.scan.exclusions.map((entry) => ({
            ...entry,
            examples: entry.examples.map(display),
          })),
          limitations: result.scan.limitations.map((entry) => ({
            ...entry,
            examples: entry.examples.map(display),
          })),
        },
      },
    },
  };
}

function findNextQueries(outcome: Extract<FindWorkflowOutcome, { kind: "completed" }>): string[] {
  if (outcome.data.kind === "semantic" && outcome.data.symbols.length === 0) {
    return [
      "If you know the file, use code_resolve with a file selector to enumerate document declarations",
    ];
  }
  return [];
}

function createFindEvidence(outcome: Extract<FindWorkflowOutcome, { kind: "completed" }>): {
  total: number;
  metadata: EvidenceListMetadata;
} {
  if (outcome.data.kind === "semantic") {
    const params = {
      key: "find.semanticSymbols",
      items: [...outcome.data.symbols],
      maxResults: outcome.maxResults,
    };
    // Exclusion-only results counted every in-policy row; the separate
    // exclusion disclosure still reports the dropped paths.
    const providerLimited =
      outcome.data.partialReason !== null && outcome.data.partialMetadata?.exclusionOnly !== true;
    const evidence = providerLimited
      ? createPartialEvidenceList({ ...params, partialReason: "provider-limited" })
      : createEvidenceList(params);
    return { total: outcome.data.symbols.length, metadata: evidence.metadata };
  }

  const result = outcome.data.result;
  const evidence = result.partialReason
    ? createPartialEvidenceList({
        key: "find.astMatches",
        items: [...result.matches],
        maxResults: outcome.maxResults,
        partialReason: result.partialReason,
      })
    : createEvidenceList({
        key: "find.astMatches",
        items: [...result.matches],
        maxResults: outcome.maxResults,
      });
  return { total: result.matches.length, metadata: evidence.metadata };
}

function findItems(
  data: Extract<FindWorkflowOutcome, { kind: "completed" }>["data"],
): readonly unknown[] {
  return data.kind === "semantic" ? data.symbols : data.result.matches;
}

function formatFindDisplayItem(kind: "semantic" | "ast", item: unknown): string {
  if (kind === "ast") {
    const match = item as {
      name: string;
      kind: string;
      file: string;
      line: number;
      startCharacter: number;
      endLine: number;
      endCharacter: number;
    };
    return `${match.name} (${match.kind}) — ${match.file}:L${match.line}:${match.startCharacter}–L${match.endLine}:${match.endCharacter}`;
  }

  const symbol = item as {
    name: string;
    kind: string;
    file: string;
    container?: string | null;
    nameAnchor?: { line: number };
    declarationAnchor: { line: number };
  };
  const container = symbol.container ? ` in ${symbol.container}` : "";
  const anchor = symbol.nameAnchor ?? symbol.declarationAnchor;
  return `${symbol.name} [${symbol.kind}]${container} — ${symbol.file}:L${anchor.line}`;
}

function findProvenance(
  kind: Extract<FindWorkflowOutcome, { kind: "completed" }>["data"]["kind"],
): ResultProvenance[] {
  return kind === "semantic"
    ? [{ source: "semantic", capability: "workspace-symbol" }]
    : [{ source: "structural", capability: "tree-sitter" }];
}

import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { scopedSymbolFailureMessage, searchErrorResult } from "../result/errors.ts";
import { renderFindResult } from "./render.ts";
import { structuredFindResult } from "./structured.ts";

type FindOutcome = Awaited<ReturnType<CodeIntelToolExecCtx["session"]["find"]>>;

/** Assemble the final model-visible code_find result for one workflow outcome. */
export function finishFindResult(
  outcome: FindOutcome,
  cwd: string,
  scope: readonly string[] | undefined,
  mode?: FindMode,
): CodeIntelResult {
  if (outcome.kind === "unavailable") {
    const reason =
      mode === "semantic" && scope?.length
        ? scopedSymbolFailureMessage(outcome.reason)
        : outcome.reason;
    throw new Error(reason);
  }
  if (outcome.kind === "invalid-input") {
    return {
      ...searchErrorResult(`**Error:** ${outcome.message}`, {
        scope: Array.isArray(scope) ? scope.join(", ") : null,
        nextQueries: ["Fix the search input and retry"],
        message: outcome.message,
      }),
      structuredContent: {
        kind: "invalid-input",
        confidence: "unavailable",
        matches: [],
        evidenceLists: [],
        nextQueries: ["Fix the search input and retry"],
        message: outcome.message,
      },
    };
  }

  const assembly = assembleFindWorkflowResult(outcome, cwd);
  return {
    content: renderFindResult(assembly),
    structuredContent: structuredFindResult(assembly, cwd),
    details: {
      type: "search",
      data: assembly.details,
      status: "completed",
      displaySections: assembly.displaySections,
    },
  };
}
