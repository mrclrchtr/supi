import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

export const CONTEXT_REPORT_TOOL_NAME = "context_report";
export const CONTEXT_REPORT_TOOL_LABEL = "Context Usage";

/** Canonical provider-facing metadata for the context_report tool. */
export const contextReportSpec = {
  name: CONTEXT_REPORT_TOOL_NAME,
  label: CONTEXT_REPORT_TOOL_LABEL,
  parameters: Type.Object({
    mode: Type.Optional(
      StringEnum(["concise", "full"] as const, {
        description: "Omit for concise capacity data, or use full for the diagnostic report.",
      }),
    ),
  }),
} as const;
