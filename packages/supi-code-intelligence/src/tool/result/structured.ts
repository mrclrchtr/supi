import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

/** Collection confidence, independent of result completeness. */
export const ConfidenceSchema = StringEnum(["semantic", "structural", "heuristic", "unavailable"]);

/** Canonical evidence counts; null totals mean collection could not establish completeness. */
export const EvidenceListSchema = Type.Object(
  {
    key: Type.String(),
    totalCount: Type.Union([Type.Integer(), Type.Null()]),
    shownCount: Type.Integer(),
    omittedCount: Type.Union([Type.Integer(), Type.Null()]),
    partialReason: Type.Union([Type.String(), Type.Null()]),
    partialMessage: Type.Optional(Type.String()),
    invalidLocationCount: Type.Optional(Type.Integer()),
  },
  { additionalProperties: false },
);

/** Provider recovery ranges use zero-based UTF-16 positions. */
export const RecoveryRangeSchema = Type.Object({
  start: Type.Object({ line: Type.Integer(), character: Type.Integer() }),
  end: Type.Object({ line: Type.Integer(), character: Type.Integer() }),
});

/** Reusable target handle with one-based UTF-16 coordinates, never a mutable store entry. */
export const NavigationTargetSchema = Type.Object(
  {
    handle: Type.String(),
    name: Type.Union([Type.String(), Type.Null()]),
    kind: Type.Union([Type.String(), Type.Null()]),
    nativeKind: Type.Optional(Type.String()),
    file: Type.String(),
    line: Type.Integer(),
    character: Type.Integer(),
    anchorKind: StringEnum(["name", "declaration"]),
    container: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    confidence: Type.Optional(ConfidenceSchema),
    provenance: Type.Optional(Type.Array(StringEnum(["semantic", "structural"]))),
    resolution: Type.Optional(
      Type.Object({
        requested: Type.Object({ line: Type.Integer(), character: Type.Integer() }),
        resolved: Type.Object({ line: Type.Integer(), character: Type.Integer() }),
        snapped: Type.Boolean(),
        source: StringEnum(["semantic", "structural", "structural-identifier"]),
      }),
    ),
  },
  { additionalProperties: false },
);

/** Source ranges suggested for a subsequent read, not additional code evidence. */
export const ReadNextSchema = Type.Object(
  {
    file: Type.String(),
    startLine: Type.Integer(),
    endLine: Type.Integer(),
    reason: Type.String(),
  },
  { additionalProperties: false },
);
