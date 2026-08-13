import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import {
  createEvidenceList,
  createPartialEvidenceList,
  type EvidenceListMetadata,
} from "../../analysis/evidence.ts";
import type { FindWorkflowOutcome } from "../../session/find-types.ts";
import {
  assembledNextQueries,
  assembleToolResult,
  type ResultProvenance,
  type ToolResultAssembly,
} from "./assembly.ts";
import type { SearchDetails } from "./types.ts";

/** Presentation-neutral assembled find result. */
export interface FindResultAssembly {
  outcome: Extract<FindWorkflowOutcome, { kind: "completed" }>;
  assembled: ToolResultAssembly<Extract<FindWorkflowOutcome, { kind: "completed" }>["data"]>;
  details: SearchDetails;
}

/** Assemble one completed code-aware search outcome before presentation. */
export function assembleFindWorkflowResult(
  outcome: Extract<FindWorkflowOutcome, { kind: "completed" }>,
): FindResultAssembly {
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

  return {
    outcome,
    assembled,
    details: {
      confidence,
      scope: outcome.scopeLabel === "." ? null : outcome.scopeLabel,
      candidateCount: evidence.total,
      omittedCount: assembled.totals.omittedCount,
      evidenceLists: [...assembled.evidenceLists],
      nextQueries: assembledNextQueries(assembled),
      ...(outcome.data.kind === "ast" ? { scan: outcome.data.result.scan } : {}),
    },
  };
}

function findNextQueries(outcome: Extract<FindWorkflowOutcome, { kind: "completed" }>): string[] {
  if (outcome.data.kind === "semantic" && outcome.data.symbols.length === 0) {
    return [
      "If you know the file, use code_resolve with a file selector to enumerate document declarations",
      "Change mode only when you need a different code-aware evidence substrate",
    ];
  }
  if (outcome.data.kind === "ast" && outcome.data.astKind === "call") {
    return [
      "Use code_graph references on a resolved target for symbol-identity relationships",
      "Use PI grep for literal or regex source matches when it is active",
    ];
  }
  return ["Change mode only when you need a different code-aware evidence substrate"];
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
    const evidence = outcome.data.partialReason
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

function findProvenance(
  kind: Extract<FindWorkflowOutcome, { kind: "completed" }>["data"]["kind"],
): ResultProvenance[] {
  return kind === "semantic"
    ? [{ source: "semantic", capability: "workspace-symbol" }]
    : [{ source: "structural", capability: "tree-sitter" }];
}
