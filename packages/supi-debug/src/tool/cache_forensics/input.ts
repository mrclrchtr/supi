import type { Static } from "typebox";
import { Type } from "typebox";
import { DEFAULT_FINDINGS_LIMIT, MAX_FINDINGS_LIMIT } from "../../cache/forensics/types.ts";

/** Parameter schema for cache_forensics, shared by its spec and execution. */
export const cacheForensicsParameters = Type.Object(
  {
    pattern: Type.Enum(["hotspots", "breakdown", "correlate", "idle"], {
      type: "string",
      description:
        "Analysis pattern: breakdown=cause totals; hotspots=largest drops; correlate=preceding tool shapes; idle=drops after long gaps.",
    }),
    since: Type.Optional(
      Type.String({
        description: 'Duration string like "7d", "24h", "30m".',
        default: "7d",
      }),
    ),
    minDrop: Type.Optional(
      Type.Number({
        description: "Minimum hit-rate drop in percentage points to include.",
        default: 0,
      }),
    ),
    maxSessions: Type.Optional(
      Type.Integer({
        minimum: 1,
        description: "Maximum sessions to scan.",
        default: 100,
      }),
    ),
    limit: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: MAX_FINDINGS_LIMIT,
        description: "Maximum findings to return.",
        default: DEFAULT_FINDINGS_LIMIT,
      }),
    ),
  },
  { additionalProperties: false },
);

/** Validated cache_forensics parameters. */
export type CacheForensicsParams = Static<typeof cacheForensicsParameters>;
