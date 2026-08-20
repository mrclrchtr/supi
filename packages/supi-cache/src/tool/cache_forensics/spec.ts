import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { makeCacheForensicsExecute } from "./execute.ts";

export const CACHE_FORENSICS_TOOL_NAME = "cache_forensics";
export const CACHE_FORENSICS_TOOL_LABEL = "Cache Forensics";

/** Canonical provider-facing metadata for the cache_forensics tool. */
export const cacheForensicsSpec = {
  name: CACHE_FORENSICS_TOOL_NAME,
  label: CACHE_FORENSICS_TOOL_LABEL,
  parameters: Type.Object({
    pattern: StringEnum(["hotspots", "breakdown", "correlate", "idle"], {
      description: "Query pattern",
    }),
    since: Type.Optional(
      Type.String({
        description: 'Duration string like "7d", "24h", "30m". Default: "7d"',
        default: "7d",
      }),
    ),
    minDrop: Type.Optional(
      Type.Number({
        description: "Minimum hit-rate drop in percentage points to include. Default: 0",
        default: 0,
      }),
    ),
    maxSessions: Type.Optional(
      Type.Number({
        description: "Maximum sessions to scan. Default: 100",
        default: 100,
      }),
    ),
  }),
  execute: makeCacheForensicsExecute(),
} as const;
