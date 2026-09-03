import type { TSchema } from "typebox";
import type { CuratedModel } from "../../types.ts";
import { buildAntigravityRunSchema } from "./input.ts";

/** Canonical Antigravity tool name. */
export const ANTIGRAVITY_RUN_TOOL_NAME = "antigravity_run";
/** Human-facing Antigravity tool label. */
export const ANTIGRAVITY_RUN_TOOL_LABEL = "Antigravity Run";

/** Build the provider-facing parameters from one immutable Model Catalogue. */
export function buildAntigravityRunParameters(catalogue: readonly CuratedModel[]): TSchema {
  return buildAntigravityRunSchema(catalogue);
}

/** Canonical machine-readable metadata for antigravity_run. */
export const antigravityRunSpec = {
  name: ANTIGRAVITY_RUN_TOOL_NAME,
  label: ANTIGRAVITY_RUN_TOOL_LABEL,
  executionMode: "parallel",
} as const;
