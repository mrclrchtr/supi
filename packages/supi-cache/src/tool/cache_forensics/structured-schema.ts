import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";

const paramShapeSchema = Type.Union([
  Type.Object(
    { kind: Type.Literal("string"), len: Type.Number(), multiline: Type.Boolean() },
    { additionalProperties: false },
  ),
  Type.Object({ kind: Type.Literal("number") }, { additionalProperties: false }),
  Type.Object({ kind: Type.Literal("boolean") }, { additionalProperties: false }),
  Type.Object(
    { kind: Type.Literal("object"), keyCount: Type.Number() },
    { additionalProperties: false },
  ),
  Type.Object({ kind: Type.Literal("array"), len: Type.Number() }, { additionalProperties: false }),
]);

const causeSchema = Type.Union([
  Type.Object(
    { type: StringEnum(["compaction", "branch_summary", "prompt_change", "unknown"]) },
    { additionalProperties: false },
  ),
  Type.Object(
    { type: Type.Literal("model_change"), model: Type.String() },
    { additionalProperties: false },
  ),
  Type.Object(
    { type: Type.Literal("idle"), idleGapMinutes: Type.Number() },
    { additionalProperties: false },
  ),
]);

const findingSchema = Type.Object(
  {
    sessionId: Type.String(),
    turnIndex: Type.Number(),
    previousRate: Type.Optional(Type.Number()),
    currentRate: Type.Optional(Type.Number()),
    drop: Type.Number(),
    cause: causeSchema,
    toolsBefore: Type.Array(
      Type.Object(
        {
          toolName: Type.String(),
          paramKeys: Type.Array(Type.String()),
          paramShapes: Type.Record(Type.String(), paramShapeSchema),
        },
        { additionalProperties: false },
      ),
    ),
    idleGapMinutes: Type.Optional(Type.Number()),
    missedTokens: Type.Optional(Type.Number()),
    missedCost: Type.Optional(Type.Number()),
    modelChanged: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

const scanFields = {
  sessionsScanned: Type.Number(),
  turnsAnalyzed: Type.Number(),
};
const findingLimitFields = {
  findingsTotal: Type.Optional(Type.Number()),
  findingsLimit: Type.Optional(Type.Number()),
};

/** Complete public query result, before applying the all-or-spill size policy. */
export const forensicsDataSchema = Type.Union([
  Type.Object(
    {
      pattern: Type.Literal("breakdown"),
      ...scanFields,
      breakdown: Type.Object(
        {
          compaction: Type.Number(),
          branch_summary: Type.Number(),
          model_change: Type.Number(),
          prompt_change: Type.Number(),
          unknown: Type.Number(),
          idle: Type.Number(),
        },
        { additionalProperties: false },
      ),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      pattern: StringEnum(["hotspots", "correlate", "idle"]),
      ...scanFields,
      findings: Type.Array(findingSchema),
      ...findingLimitFields,
    },
    { additionalProperties: false },
  ),
]);

/** Existing spill summary; the referenced file contains the complete query-limited public data. */
export const forensicsSpillSchema = Type.Object(
  {
    truncated: Type.Literal(true),
    fullOutputPath: Type.String(),
    totalLines: Type.Number(),
    totalBytes: Type.Number(),
    maxLines: Type.Number(),
    maxBytes: Type.Number(),
    pattern: StringEnum(["hotspots", "breakdown", "correlate", "idle"]),
    since: Type.String(),
    minDrop: Type.Number(),
    maxSessions: Type.Number(),
    limit: Type.Number(),
    ...findingLimitFields,
    ...scanFields,
  },
  { additionalProperties: false },
);

/** Native cache_forensics contract: a complete public result or an all-or-spill summary. */
export const cacheForensicsOutputSchema = Type.Union([forensicsDataSchema, forensicsSpillSchema]);

/** JSON-serializable public result accepted by the registered output schema. */
export type ForensicsOutput = Static<typeof cacheForensicsOutputSchema>;
