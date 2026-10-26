import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import type { TargetWorkflowOutcome } from "../../session/target-workflow.ts";
import {
  ConfidenceSchema,
  EvidenceListSchema,
  NavigationTargetSchema,
  RecoveryRangeSchema,
} from "../result/structured.ts";
import type { ResolveDetails } from "../result/types.ts";

/** Codemode contract for resolution, including candidate selection and invalid input. */
export const ResolveOutputSchema = Type.Object(
  {
    kind: StringEnum([
      "resolved",
      "target-group",
      "disambiguation",
      "kind-mismatch",
      "invalid-input",
    ]),
    confidence: ConfidenceSchema,
    targets: Type.Array(NavigationTargetSchema),
    evidenceLists: Type.Array(EvidenceListSchema),
    nextQueries: Type.Array(Type.String()),
    notes: Type.Array(Type.String()),
    message: Type.Optional(Type.String()),
    file: Type.Optional(Type.String()),
    requestedKind: Type.Optional(Type.String()),
    unknownNestingCount: Type.Optional(Type.Integer()),
    discoveryProvenance: Type.Optional(Type.Array(StringEnum(["semantic", "structural"]))),
    partialReason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    errorRanges: Type.Optional(Type.Array(RecoveryRangeSchema)),
  },
  { additionalProperties: false },
);

/** Project caller-visible targets without internal store identity or fingerprints. */
export function structuredResolveResult(
  data: ResolveDetails,
  outcome: Exclude<TargetWorkflowOutcome, { kind: "unavailable" }>,
): Static<typeof ResolveOutputSchema> {
  return {
    kind: outcome.kind,
    confidence: data.confidence,
    targets: [
      ...data.targets.map((entry) => ({
        handle: entry.targetId,
        name: entry.name,
        kind: entry.kind,
        ...(entry.nativeKind === undefined ? {} : { nativeKind: entry.nativeKind }),
        file: entry.file,
        line: entry.displayLine,
        character: entry.displayCharacter,
        anchorKind: entry.anchorKind,
        container: entry.container,
        confidence: entry.confidence,
        provenance: [...entry.provenance],
        ...(entry.resolution
          ? {
              resolution: {
                requested: { ...entry.resolution.requested },
                resolved: { ...entry.resolution.resolved },
                snapped: entry.resolution.snapped,
                source: entry.resolution.source,
              },
            }
          : {}),
      })),
      ...(data.candidates ?? []).map((candidate) => ({
        handle: candidate.targetId,
        name: candidate.name,
        kind: candidate.kind,
        file: candidate.file,
        line: candidate.line,
        character: candidate.character,
        anchorKind: candidate.anchorKind,
        container: candidate.container,
      })),
    ],
    evidenceLists: (data.evidenceLists ?? []).map((evidence) => ({ ...evidence })),
    nextQueries: data.nextQueries,
    notes: outcome.kind === "resolved" ? [...outcome.notes] : [],
    ...(data.message === undefined ? {} : { message: data.message }),
    ...(data.groupFile === undefined ? {} : { file: data.groupFile }),
    ...(data.requestedKind === undefined ? {} : { requestedKind: data.requestedKind }),
    ...(data.groupUnknownNestingCount === undefined
      ? {}
      : { unknownNestingCount: data.groupUnknownNestingCount }),
    ...(data.groupDiscoveryProvenance === undefined
      ? {}
      : { discoveryProvenance: [...data.groupDiscoveryProvenance] }),
    ...(data.groupPartialReason === undefined ? {} : { partialReason: data.groupPartialReason }),
    ...(data.groupErrorRanges === undefined
      ? {}
      : {
          errorRanges: data.groupErrorRanges.map((range) => ({
            start: { ...range.start },
            end: { ...range.end },
          })),
        }),
  };
}
