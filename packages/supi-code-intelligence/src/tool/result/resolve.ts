import { relative } from "node:path";
import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { EvidenceListMetadata } from "../../analysis/evidence.ts";
import { createEvidenceList } from "../../analysis/evidence.ts";
import type { TargetStoreEntry } from "../../session/target-store.ts";
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

interface ResolveProjection {
  readonly key: string;
  readonly title: string;
  readonly status: "complete" | "unavailable";
  readonly items: readonly unknown[];
  readonly confidence: ConfidenceMode;
  readonly evidence: EvidenceListMetadata | null;
  readonly details: ResolveDetails;
}

/** Assemble resolved-target facts before markdown and TUI adapters render them. */
export function assembleResolveResult(
  outcome: TargetWorkflowOutcome,
  cwd: string,
): ResolveResultAssembly {
  const projection = projectResolveOutcome(outcome, cwd);
  const provenance = resolveProvenance(outcome);
  const assembled = assembleToolResult({
    data: outcome,
    sections: [
      {
        key: projection.key,
        title: projection.title,
        status: projection.status,
        items: projection.items,
        confidence: projection.confidence,
        provenance,
      },
    ],
    evidenceLists: projection.evidence ? [projection.evidence] : [],
    nextQueries: projection.details.nextQueries,
    candidateCount: projection.details.targetCount,
    confidence: projection.confidence,
    provenance,
  });

  return Object.freeze({
    outcome,
    cwd,
    assembled,
    details: {
      ...projection.details,
      omittedCount: assembled.totals.omittedCount,
      evidenceLists: [...assembled.evidenceLists],
      nextQueries: assembledNextQueries(assembled),
    },
  });
}

function projectResolveOutcome(outcome: TargetWorkflowOutcome, cwd: string): ResolveProjection {
  switch (outcome.kind) {
    case "resolved":
      return projectResolved(outcome.entry, cwd);
    case "target-group":
      return projectTargetGroup(outcome, cwd);
    case "disambiguation":
    case "kind-mismatch":
      return projectCandidateOutcome(outcome);
    case "invalid-input":
    case "unavailable":
      return projectFailure(outcome.kind);
  }
}

function projectResolved(target: Readonly<TargetStoreEntry>, cwd: string): ResolveProjection {
  const evidence = createEvidenceList({ key: "resolve.targets", items: [target] }).metadata;
  return {
    key: "resolve.targets",
    title: "Resolved target",
    status: "complete",
    items: [target],
    confidence: target.confidence,
    evidence,
    details: {
      resultKind: "resolved",
      confidence: target.confidence,
      targetCount: 1,
      omittedCount: 0,
      evidenceLists: [evidence],
      targets: [toTargetDetails(target, cwd)],
      nextQueries: buildResolveNextQueries(target.targetId, target.kind),
    },
  };
}

function projectTargetGroup(
  outcome: Extract<TargetWorkflowOutcome, { kind: "target-group" }>,
  cwd: string,
): ResolveProjection {
  const evidence = {
    key: "resolve.targets",
    items: [...outcome.targets],
    metadata: {
      key: "resolve.targets",
      totalCount: outcome.totalCount,
      shownCount: outcome.targets.length,
      omittedCount: outcome.omittedCount,
      partialReason: null,
    },
  };
  return {
    key: "resolve.target-group",
    title: "Target group",
    status: "complete",
    items: evidence.items,
    confidence: outcome.confidence,
    evidence: evidence.metadata,
    details: {
      resultKind: "target-group",
      groupFile: relative(cwd, outcome.file) || outcome.file,
      groupDiscoveryProvenance: [...outcome.discoveryProvenance],
      confidence: outcome.confidence,
      targetCount: outcome.totalCount,
      omittedCount: evidence.metadata.omittedCount,
      evidenceLists: [evidence.metadata],
      targets: evidence.items.map((target) => toTargetDetails(target, cwd)),
      nextQueries:
        outcome.totalCount > 0
          ? ["Choose one Target group member handle for precise graph or refactor work"]
          : ["Use code_inspect for point facts or code_find for explicit source evidence"],
    },
  };
}

function projectCandidateOutcome(
  outcome: Extract<TargetWorkflowOutcome, { kind: "disambiguation" | "kind-mismatch" }>,
): ResolveProjection {
  const totalCount = outcome.candidates.length + outcome.omittedCount;
  const evidence: EvidenceListMetadata = {
    key: "resolve.candidates",
    totalCount,
    shownCount: outcome.candidates.length,
    omittedCount: outcome.omittedCount,
    partialReason: null,
  };
  const mismatch = outcome.kind === "kind-mismatch";
  return {
    key: "resolve.candidates",
    title: mismatch ? "Near matches" : "Candidates",
    status: "complete",
    items: outcome.candidates,
    confidence: "semantic",
    evidence,
    details: {
      resultKind: outcome.kind,
      ...(mismatch ? { requestedKind: outcome.requestedKind } : {}),
      confidence: "semantic",
      targetCount: totalCount,
      omittedCount: outcome.omittedCount,
      evidenceLists: [evidence],
      targets: [],
      candidates: outcome.candidates.map((candidate) => ({
        targetId: candidate.targetId,
        name: candidate.name,
        kind: candidate.kind,
        container: candidate.container,
        file: candidate.file,
        line: candidate.line,
        character: candidate.character,
        rank: candidate.rank,
        anchorKind: candidate.anchorKind,
      })),
      nextQueries: mismatch
        ? ["Retry without symbolKind, use an observed provider kind, or choose a near-match handle"]
        : ["Choose one candidate handle, or narrow the symbol selector with scope or symbolKind"],
    },
  };
}

function projectFailure(kind: "invalid-input" | "unavailable"): ResolveProjection {
  return {
    key: "resolve.targets",
    title: "Resolved target",
    status: "unavailable",
    items: [],
    confidence: "unavailable",
    evidence: null,
    details: {
      resultKind: kind,
      confidence: "unavailable",
      targetCount: 0,
      omittedCount: 0,
      targets: [],
      nextQueries: [
        "Refine the target selector",
        "Use an anchor target when you already know an identifier coordinate",
      ],
    },
  };
}

function toTargetDetails(target: Readonly<TargetStoreEntry>, cwd: string) {
  return {
    targetId: target.targetId,
    spanId: target.spanId,
    file: relative(cwd, target.file) || target.file,
    displayLine: target.displayLine,
    displayCharacter: target.displayCharacter,
    name: target.name,
    kind: target.kind,
    container: target.container,
    anchorKind: target.anchorKind,
    confidence: target.confidence,
    provenance: [...target.provenance],
    resolution: target.resolution,
  };
}

function resolveProvenance(outcome: TargetWorkflowOutcome): ResultProvenance[] {
  const sources = new Set<"semantic" | "structural">();
  if (outcome.kind === "resolved") {
    for (const source of outcome.entry.provenance) sources.add(source);
  } else if (outcome.kind === "target-group") {
    for (const source of outcome.discoveryProvenance) sources.add(source);
  } else if (outcome.kind === "disambiguation" || outcome.kind === "kind-mismatch") {
    sources.add("semantic");
  }
  return [
    ...(sources.has("semantic")
      ? [{ source: "semantic" as const, detail: "target-workflow" }]
      : []),
    ...(sources.has("structural")
      ? [{ source: "structural" as const, detail: "target-workflow" }]
      : []),
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
