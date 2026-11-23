import { makeCacheForensicsExecute } from "./execute.ts";
import { cacheForensicsParameters } from "./input.ts";
import { cacheForensicsOutputSchema } from "./structured-schema.ts";

export const CACHE_FORENSICS_TOOL_NAME = "cache_forensics";
export const CACHE_FORENSICS_TOOL_LABEL = "Cache Forensics";

/** Canonical provider-facing metadata for the cache_forensics tool. */
export const cacheForensicsSpec = {
  name: CACHE_FORENSICS_TOOL_NAME,
  label: CACHE_FORENSICS_TOOL_LABEL,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  parameters: cacheForensicsParameters,
  outputSchema: cacheForensicsOutputSchema,
  execute: makeCacheForensicsExecute(),
} as const;
