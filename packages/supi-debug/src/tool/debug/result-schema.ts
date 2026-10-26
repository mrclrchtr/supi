import type { JsonValue } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import { debugLevelSchema, debugOperationIdSchema } from "./input.ts";

// Diagnostic payloads have producer-defined keys. Transport values are normalized to JSON.
const diagnosticDataSchema = Type.Unsafe<JsonValue>(
  Type.Unknown({ description: "JSON-safe diagnostic data with producer-defined fields." }),
);

/** Native structured result contract for the debug tool, independent of UI/text bounds. */
export const debugOutputSchema = Type.Object({
  events: Type.Array(
    Type.Object({
      id: Type.Number(),
      timestamp: Type.Number({ description: "Unix time in milliseconds." }),
      operationId: Type.Optional(debugOperationIdSchema),
      source: Type.String(),
      level: debugLevelSchema,
      category: Type.String(),
      message: Type.String(),
      cwd: Type.Optional(Type.String()),
      data: Type.Optional(diagnosticDataSchema),
      rawData: Type.Optional(diagnosticDataSchema),
    }),
  ),
  provenance: Type.Union([
    Type.Object({ kind: Type.Literal("live"), scope: Type.Literal("retained-buffer") }),
    Type.Object({
      kind: Type.Literal("persisted"),
      sessionFile: Type.String(),
      persistedEventCount: Type.Integer({ minimum: 0 }),
      invalidEventCount: Type.Integer({ minimum: 0 }),
      malformedLineCount: Type.Integer({
        minimum: 0,
        description:
          "Nonblank session JSONL lines that could not be parsed; their event identity is unknown.",
      }),
    }),
  ]),
  selection: Type.Object({
    matchedEventCount: Type.Integer({ minimum: 0 }),
    returnedEventCount: Type.Integer({ minimum: 0 }),
    omittedEventCount: Type.Integer({ minimum: 0 }),
    complete: Type.Boolean({
      description:
        "All matching events in this source were returned, no recognized persisted debug entries were invalid, and no nonblank session JSONL lines were malformed. Live evidence covers only the retained buffer, not the entire session.",
    }),
  }),
  rawAccessDenied: Type.Boolean(),
  rawDataUnavailable: Type.Boolean(),
  dataNormalized: Type.Boolean({
    description: "Non-JSON values or excessive nesting were replaced with diagnostic text markers.",
  }),
  emptyReason: Type.Optional(
    Type.Union([
      Type.Literal("no-persisted-events"),
      Type.Literal("no-matches"),
      Type.Literal("query-limit"),
    ]),
  ),
  modelOutput: Type.Object({
    truncated: Type.Boolean(),
    outputLines: Type.Optional(Type.Integer({ minimum: 0 })),
    totalLines: Type.Optional(Type.Integer({ minimum: 0 })),
    outputBytes: Type.Optional(Type.Integer({ minimum: 0 })),
    totalBytes: Type.Optional(Type.Integer({ minimum: 0 })),
  }),
});

/** Selected event evidence and query completeness delivered to programmatic callers. */
export type DebugToolOutput = Static<typeof debugOutputSchema>;
