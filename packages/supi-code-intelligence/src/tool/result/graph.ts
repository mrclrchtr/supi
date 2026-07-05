import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { EvidenceListMetadata } from "../../analysis/evidence.ts";
import type { ReadNextItem } from "../../analysis/read-next.ts";
import type { TestSurfaceDetails } from "../../analysis/tests/test-discovery.ts";
import type { SearchDetails } from "./types.ts";

/** Relation families accepted by code_graph. */
export type GraphRelationKind =
  | "all"
  | "references"
  | "callees"
  | "imports"
  | "exports"
  | "implements"
  | "tests";

/** A relation section in an assembled code_graph result. */
export type GraphSection =
  | {
      kind: "ok";
      rel: GraphRelationKind;
      count: number;
      /** Relation body prepared for markdown/TUI presentation adapters. */
      content: string;
      evidenceLists?: EvidenceListMetadata[];
      tests?: TestSurfaceDetails;
      readNext?: ReadNextItem[];
    }
  | { kind: "unavailable"; rel: GraphRelationKind; message: string; tests?: TestSurfaceDetails }
  | {
      kind: "not-implemented";
      rel: GraphRelationKind;
      message: string;
      tests?: TestSurfaceDetails;
    };

export interface GraphResultAssembly {
  displayName: string;
  sections: GraphSection[];
  resolvedDisplayFile: string;
  scope: string | undefined;
  details: SearchDetails;
}

/** Assemble code_graph evidence/details before markdown and TUI adapters render it. */
export function assembleGraphResult(input: {
  displayName: string;
  sections: GraphSection[];
  resolvedDisplayFile: string;
  scope: string | undefined;
}): GraphResultAssembly {
  const evidenceLists = input.sections.flatMap((section) =>
    section.kind === "ok" ? (section.evidenceLists ?? []) : [],
  );
  const omittedCount = evidenceLists.reduce(
    (sum, evidenceList) => sum + (evidenceList.omittedCount ?? 0),
    0,
  );

  return {
    ...input,
    details: {
      confidence: graphConfidence(input.sections),
      scope: input.scope ?? null,
      candidateCount: input.sections.reduce(
        (sum, section) => sum + (section.kind === "ok" ? section.count : 0),
        0,
      ),
      omittedCount,
      evidenceLists,
      nextQueries: [
        "`code_orientation` on individual results for deeper orientation",
        "`code_impact` for impact analysis",
      ],
      tests: input.sections.find((section) => section.rel === "tests")?.tests,
    },
  };
}

function graphConfidence(sections: GraphSection[]): ConfidenceMode {
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
  return hasSemantic ? "semantic" : hasStructural ? "structural" : "unavailable";
}
