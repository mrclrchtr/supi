import { Type } from "typebox";
import { contextReportOutputSchema } from "./result-schema.ts";

export const CONTEXT_REPORT_TOOL_NAME = "context_report";
export const CONTEXT_REPORT_TOOL_LABEL = "Context Usage";

/** Canonical provider-facing metadata for the context_report tool. */
export const contextReportSpec = {
  name: CONTEXT_REPORT_TOOL_NAME,
  label: CONTEXT_REPORT_TOOL_LABEL,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  outputSchema: contextReportOutputSchema,
  parameters: Type.Object({
    mode: Type.Optional(
      Type.Enum(["concise", "full"] as const, {
        type: "string",
        description: "Omit for concise capacity data, or use full for focused attribution.",
      }),
    ),
  }),
} as const;
