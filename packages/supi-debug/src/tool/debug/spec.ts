import { Type } from "typebox";
import { makeDebugExecute } from "./execute.ts";
import { debugLevelSchema, debugOperationIdSchema } from "./input.ts";
import { debugOutputSchema } from "./result-schema.ts";

export const DEBUG_TOOL_NAME = "debug";
export const DEBUG_TOOL_LABEL = "SuPi Debug";

/** Canonical provider-facing metadata for the debug tool. */
export const debugSpec = {
  name: DEBUG_TOOL_NAME,
  label: DEBUG_TOOL_LABEL,
  parameters: Type.Object({
    operationId: Type.Optional({
      ...debugOperationIdSchema,
      description: "Filter by exact Debug Operation ID",
    }),
    source: Type.Optional(Type.String({ description: "Filter by extension source, e.g. lsp" })),
    level: Type.Optional({ ...debugLevelSchema, description: "Filter by debug level" }),
    category: Type.Optional(Type.String({ description: "Filter by event category" })),
    limit: Type.Optional(Type.Number({ description: "Maximum number of events to return" })),
    sessionFile: Type.Optional(
      Type.String({ description: "PI session JSONL file containing persisted debug events" }),
    ),
    includeRaw: Type.Optional(
      Type.Boolean({ description: "Request raw event data when settings permit it" }),
    ),
  }),
  outputSchema: debugOutputSchema,
  execute: makeDebugExecute(),
} as const;
