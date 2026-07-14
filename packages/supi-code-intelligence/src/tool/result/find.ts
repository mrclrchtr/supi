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

export interface FindResultAssemblyInput {
  confidence: ConfidenceMode;
  scope: string | null;
  candidateCount: number;
  omittedCount?: number;
  evidenceLists?: EvidenceListMetadata[];
  nextQueries: string[];
}

/** Presentation-neutral assembled find result. */
export interface FindResultAssembly {
  outcome: Extract<FindWorkflowOutcome, { kind: "completed" }>;
  assembled: ToolResultAssembly<Extract<FindWorkflowOutcome, { kind: "completed" }>["data"]>;
  details: SearchDetails;
}

/** Assemble one completed search outcome before presentation adapters render it. */
export function assembleFindWorkflowResult(
  outcome: Extract<FindWorkflowOutcome, { kind: "completed" }>,
): FindResultAssembly {
  const evidence = createFindEvidence(outcome);
  const confidence: ConfidenceMode =
    outcome.data.kind === "semantic"
      ? "semantic"
      : outcome.data.kind === "ast"
        ? "structural"
        : "heuristic";
  const nextQueries =
    outcome.data.kind === "ast" && outcome.data.astKind === "call"
      ? [
          "Use code_graph references on a resolved target for symbol-identity relationships",
          "Use text mode for unclassified source matches",
        ]
      : ["Change mode only when you need a different evidence substrate"];

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
      omittedCount:
        assembled.totals.omittedCount +
        (outcome.data.kind === "ast" ? outcome.data.result.omittedCount : 0),
      evidenceLists: [...assembled.evidenceLists],
      nextQueries: assembledNextQueries(assembled),
    },
  };
}

function createFindEvidence(outcome: Extract<FindWorkflowOutcome, { kind: "completed" }>): {
  total: number;
  metadata: EvidenceListMetadata;
} {
  switch (outcome.data.kind) {
    case "text":
    case "regex": {
      const evidence = outcome.data.partialReason
        ? createPartialEvidenceList({
            key: "find.textMatches",
            items: outcome.data.matches.slice(0, outcome.maxResults),
            partialReason: outcome.data.partialReason,
          })
        : createEvidenceList({
            key: "find.textMatches",
            items: [...outcome.data.matches],
            maxResults: outcome.maxResults,
          });
      return { total: outcome.data.matches.length, metadata: evidence.metadata };
    }
    case "semantic": {
      const evidence = createEvidenceList({
        key: "find.semanticSymbols",
        items: [...outcome.data.symbols],
        maxResults: outcome.maxResults,
      });
      return { total: outcome.data.symbols.length, metadata: evidence.metadata };
    }
    case "ast": {
      if (outcome.data.result.partialReason) {
        const reason =
          outcome.data.result.partialReason === "file-cap" ? "safety-limit" : "timeout";
        const evidence = createPartialEvidenceList({
          key: "find.astMatches",
          items: outcome.data.result.matches.slice(0, outcome.maxResults),
          partialReason: reason,
        });
        return { total: outcome.data.result.matches.length, metadata: evidence.metadata };
      }
      const evidence = createEvidenceList({
        key: "find.astMatches",
        items: outcome.data.result.matches,
        maxResults: outcome.maxResults,
      });
      return { total: outcome.data.result.matches.length, metadata: evidence.metadata };
    }
  }
}

function findItems(
  data: Extract<FindWorkflowOutcome, { kind: "completed" }>["data"],
): readonly unknown[] {
  switch (data.kind) {
    case "text":
    case "regex":
      return data.matches;
    case "semantic":
      return data.symbols;
    case "ast":
      return data.result.matches;
  }
}

function findProvenance(
  kind: Extract<FindWorkflowOutcome, { kind: "completed" }>["data"]["kind"],
): ResultProvenance[] {
  if (kind === "semantic") return [{ source: "semantic", capability: "workspace-symbol" }];
  if (kind === "ast") return [{ source: "structural", capability: "tree-sitter" }];
  return [{ source: "filesystem", capability: "ripgrep" }];
}

/** Assemble search details from explicit fields. */
export function assembleFindResult(input: FindResultAssemblyInput): SearchDetails {
  return {
    confidence: input.confidence,
    scope: input.scope,
    candidateCount: input.candidateCount,
    omittedCount:
      input.omittedCount ??
      (input.evidenceLists ?? []).reduce((sum, list) => sum + (list.omittedCount ?? 0), 0),
    evidenceLists: input.evidenceLists,
    nextQueries: input.nextQueries,
  };
}
