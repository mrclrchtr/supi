import { relative } from "node:path";
import type { TargetWorkflowOutcome } from "../../session/target-workflow.ts";
import {
  assembledNextQueries,
  assembleToolResult,
  type ResultProvenance,
  type ToolResultAssembly,
} from "./assembly.ts";
import type { ResolveDetails } from "./types.ts";

/** Presentation-neutral assembled code_resolve result. */
export interface ResolveResultAssembly {
  readonly outcome: TargetWorkflowOutcome;
  readonly cwd: string;
  readonly assembled: ToolResultAssembly<TargetWorkflowOutcome>;
  readonly details: ResolveDetails;
}

/** Assemble resolved-target facts before markdown and TUI adapters render them. */
export function assembleResolveResult(
  outcome: TargetWorkflowOutcome,
  cwd: string,
): ResolveResultAssembly {
  const details = buildResolveDetails(outcome, cwd);
  const provenance = resolveProvenance(outcome);
  const assembled = assembleToolResult({
    data: outcome,
    sections: [
      {
        key: outcome.kind === "disambiguation" ? "resolve.candidates" : "resolve.targets",
        title: outcome.kind === "disambiguation" ? "Candidates" : "Resolved target",
        status:
          outcome.kind === "resolved" || outcome.kind === "disambiguation"
            ? "complete"
            : "unavailable",
        items:
          outcome.kind === "resolved"
            ? [outcome.entry]
            : outcome.kind === "disambiguation"
              ? outcome.candidates
              : [],
        confidence: details.confidence,
        provenance,
      },
    ],
    evidenceLists: details.evidenceLists,
    nextQueries: details.nextQueries,
    candidateCount: details.targetCount,
    confidence: details.confidence,
    provenance,
  });
  return Object.freeze({
    outcome,
    cwd,
    assembled,
    details: {
      ...details,
      omittedCount: assembled.totals.omittedCount,
      evidenceLists: [...assembled.evidenceLists],
      nextQueries: assembledNextQueries(assembled),
    },
  });
}

function buildResolveDetails(outcome: TargetWorkflowOutcome, cwd: string): ResolveDetails {
  if (outcome.kind === "resolved") {
    const target = outcome.entry;
    return {
      confidence: target.confidence,
      targetCount: 1,
      omittedCount: 0,
      evidenceLists: [
        {
          key: "resolve.targets",
          totalCount: 1,
          shownCount: 1,
          omittedCount: 0,
          partialReason: null,
        },
      ],
      targets: [
        {
          targetId: target.targetId,
          spanId: target.spanId,
          file: relative(cwd, target.file) || target.file,
          displayLine: target.displayLine,
          displayCharacter: target.displayCharacter,
          name: target.name,
          kind: target.kind,
          anchorKind: target.anchorKind,
          confidence: target.confidence,
          provenance: target.provenance,
          resolution: target.resolution,
        },
      ],
      nextQueries: buildResolveNextQueries(target.targetId, target.kind),
    };
  }

  if (outcome.kind === "disambiguation") {
    return {
      confidence: "semantic",
      targetCount: outcome.candidates.length + outcome.omittedCount,
      omittedCount: outcome.omittedCount,
      evidenceLists: [
        {
          key: "resolve.candidates",
          totalCount: outcome.candidates.length + outcome.omittedCount,
          shownCount: outcome.candidates.length,
          omittedCount: outcome.omittedCount,
          partialReason: null,
        },
      ],
      targets: [],
      candidates: outcome.candidates.map((candidate) => ({
        targetId: candidate.targetId,
        name: candidate.name,
        kind: candidate.kind,
        container: candidate.container,
        file: candidate.file,
        line: candidate.line,
        character: candidate.character,
        reason: candidate.file,
        rank: candidate.rank,
        anchorKind: candidate.anchorKind,
      })),
      nextQueries: [
        "Choose one candidate handle, or narrow the symbol selector with scope or symbolKind",
      ],
    };
  }

  return {
    confidence: "unavailable",
    targetCount: 0,
    omittedCount: 0,
    targets: [],
    nextQueries: [
      "Refine the target selector",
      "Use an anchor target when you already know an identifier coordinate",
    ],
  };
}

function resolveProvenance(outcome: TargetWorkflowOutcome): ResultProvenance[] {
  if (outcome.kind !== "resolved") return [];
  return [
    {
      source: outcome.entry.confidence === "semantic" ? "semantic" : "structural",
      detail: outcome.entry.provenance,
    },
  ];
}

/** Suggested surviving graph relations for a resolved symbol kind. */
export function suggestedResolveRelations(kind: string | undefined | null): string[] {
  switch (kind?.toLowerCase()) {
    case "function":
    case "method":
    case "constructor":
      return ["references", "callees"];
    case "class":
    case "interface":
    case "type":
    case "enum":
      return ["references", "implements"];
    default:
      return ["references"];
  }
}

function buildResolveNextQueries(targetId: string, kind: string | null): string[] {
  const relations = suggestedResolveRelations(kind);
  return [
    `Use code_graph with target.handle "${targetId}" and relations ${JSON.stringify(relations)}`,
  ];
}
