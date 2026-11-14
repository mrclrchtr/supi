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
        partialMessage: section.data.partialMessage,
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
      return {
        ...section,
        evidence: section.data.recovery
          ? createPartialEvidenceList({
              key: "callees.calls",
              items: [...section.data.calls],
              maxResults,
              partialReason: "provider-limited",
              partialMessage: recoveryMessage(section.data.recovery, cwd),
            })
          : createEvidenceList({
              key: "callees.calls",
              items: [...section.data.calls],
              maxResults,
            }),
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
          partialMessage: section.data.partialMessage,
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
  partialMessage: string | null;
}): EvidenceList<T> {
  const common = {
    key: params.key,
    items: params.items,
    maxResults: params.maxResults,
    invalidLocationCount: params.invalidLocationCount,
    ...(params.partialMessage ? { partialMessage: params.partialMessage } : {}),
  };
  return params.partialReason === "provider-limited"
    ? createPartialEvidenceList({ ...common, partialReason: "provider-limited" })
    : createEvidenceList(common);
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
