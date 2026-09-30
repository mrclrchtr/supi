import type { TSchema } from "typebox";
import { buildConsultingRunSchema } from "./input.ts";

/** Canonical Consulting tool name. */
export const CONSULTING_RUN_TOOL_NAME = "consulting_run";
/** Human-facing tool label. */
export const CONSULTING_RUN_TOOL_LABEL = "Consultation";

/** Build provider-facing parameters from one immutable availability snapshot. */
export function buildConsultingRunParameters(agent: string, catalogue: readonly string[]): TSchema {
  return buildConsultingRunSchema(agent, catalogue);
}

/** Canonical machine-readable metadata for consulting_run. */
export const consultingRunSpec = {
  name: CONSULTING_RUN_TOOL_NAME,
  label: CONSULTING_RUN_TOOL_LABEL,
  exposure: "model-only",
  executionMode: "parallel",
} as const;
