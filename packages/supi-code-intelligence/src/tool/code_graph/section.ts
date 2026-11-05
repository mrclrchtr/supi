import {
  createEvidenceList,
  createPartialEvidenceList,
  type EvidenceList,
} from "../../analysis/evidence.ts";
import type { RelationLocationPartialReason } from "../../analysis/relations/provider-locations.ts";
import type {
  CallEntry,
  ImplementationEntry,
  ReferenceEntry,
} from "../../analysis/relations/types.ts";
import { toDisplayPath } from "../../analysis/search/paths.ts";
import type { GraphSection } from "../../session/graph-types.ts";
import { selectReferenceLocations } from "./reference-selection.ts";

type UnavailableGraphSection = Extract<GraphSection, { kind: "unavailable" }>;
type ReferenceGraphSection = Extract<GraphSection, { kind: "ok"; rel: "references" }>;
type CalleeGraphSection = Extract<GraphSection, { kind: "ok"; rel: "callees" }>;
type ImplementationGraphSection = Extract<GraphSection, { kind: "ok"; rel: "implements" }>;

/** A relation section after canonical evidence bounding. */
export type AssembledGraphSection =
  | UnavailableGraphSection
  | (ReferenceGraphSection & {
      readonly evidence: EvidenceList<ReferenceEntry>;
      readonly selectionNote: string | null;
    })
  | (CalleeGraphSection & { readonly evidence: EvidenceList<CallEntry> })
  | (ImplementationGraphSection & {
      readonly evidence: EvidenceList<ImplementationEntry>;
    });

/** Bound one relation section's evidence once, before any presentation consumes it. */
export function assembleGraphSection(
  section: GraphSection,
  maxResults: number,
  cwd: string,
): AssembledGraphSection {
  if (section.kind === "unavailable") return section;
  switch (section.rel) {
    case "references": {
      const evidence = createRelationEvidenceList({
        key: "references.locations",
        items: [...section.data.references],
        maxResults,
        invalidLocationCount: section.data.invalidLocationCount,
        partialReason: section.data.partialReason,
      });
      return {
        ...section,
        evidence: {
          ...evidence,
          items: selectReferenceLocations(section.data.references, evidence.metadata.shownCount),
        },
        selectionNote:
          (evidence.metadata.omittedCount ?? 0) > 0 &&
          section.data.references.some((site) => site.file !== section.data.references[0]?.file)
            ? "Selection: one site per file per round."
            : null,
      };
    }
    case "callees": {
      const evidence = section.data.recovery
        ? createPartialEvidenceList({
            key: "callees.calls",
            items: [...section.data.calls],
            maxResults,
            partialReason: "provider-limited",
          })
        : createEvidenceList({
            key: "callees.calls",
            items: [...section.data.calls],
            maxResults,
          });
      return {
        ...section,
        evidence: section.data.recovery
          ? {
              ...evidence,
              metadata: {
                ...evidence.metadata,
                partialMessage: recoveryMessage(section.data.recovery, cwd),
              },
            }
          : evidence,
      };
    }
    case "implements":
      return {
        ...section,
        evidence: createRelationEvidenceList({
          key: "implements.locations",
          items: [...section.data.implementations],
          maxResults,
          invalidLocationCount: section.data.invalidLocationCount,
          partialReason: section.data.partialReason,
        }),
      };
  }
}

function createRelationEvidenceList<T>(params: {
  key: string;
  items: T[];
  maxResults: number;
  invalidLocationCount: number;
  partialReason: RelationLocationPartialReason | null;
}): EvidenceList<T> {
  const evidence =
    params.partialReason === "provider-limited"
      ? createPartialEvidenceList({ ...params, partialReason: params.partialReason })
      : createEvidenceList(params);
  if (params.partialReason === null) return evidence;
  return {
    ...evidence,
    metadata: {
      ...evidence.metadata,
      partialReason: params.partialReason,
      invalidLocationCount: params.invalidLocationCount,
    },
  };
}

function recoveryMessage(
  recovery: NonNullable<CalleeGraphSection["data"]["recovery"]>,
  cwd: string,
): string {
  const locations = recovery.errorRanges.map(
    (range) => `L${range.start.line + 1}:${range.start.character + 1}`,
  );
  const suffix = locations.length > 0 ? ` Error locations: ${locations.join(", ")}.` : "";
  return `${toDisplayPath(cwd, recovery.file)}: ${recovery.reason}${suffix}`;
}
