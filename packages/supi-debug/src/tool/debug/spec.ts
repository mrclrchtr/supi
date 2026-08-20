import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { makeDebugExecute } from "./execute.ts";

export const DEBUG_TOOL_NAME = "debug";
export const DEBUG_TOOL_LABEL = "SuPi Debug";

/** Canonical provider-facing metadata for the debug tool. */
export const debugSpec = {
  name: DEBUG_TOOL_NAME,
  label: DEBUG_TOOL_LABEL,
  parameters: Type.Object({
    operationId: Type.Optional(
      Type.String({
        description: "Filter by exact Debug Operation ID",
        pattern: "^op-[A-Za-z0-9_-]{21}[AQgw]$",
      }),
    ),
    source: Type.Optional(Type.String({ description: "Filter by extension source, e.g. lsp" })),
    level: Type.Optional(
      StringEnum(["debug", "info", "warning", "error"], {
        description: "Filter by debug level",
      }),
    ),
    category: Type.Optional(Type.String({ description: "Filter by event category" })),
    limit: Type.Optional(Type.Number({ description: "Maximum number of events to return" })),
    sessionFile: Type.Optional(
      Type.String({ description: "PI session JSONL file containing persisted debug events" }),
    ),
    includeRaw: Type.Optional(
      Type.Boolean({ description: "Request raw event data when settings permit it" }),
    ),
  }),
  execute: makeDebugExecute(),
} as const;
