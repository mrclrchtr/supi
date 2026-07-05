import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { TargetStoreEntry } from "../../session/target-store.ts";
import type { ContextDetails } from "./types.ts";

export interface OrientationDetailsInput {
  confidence: ConfidenceMode;
  task?: string | null;
  focusTarget?: string | null;
  requestedSections?: string[];
  renderedSections?: string[];
  omittedCount?: number;
  nextQueries: string[];
  target?: TargetStoreEntry;
  candidates?: ContextDetails["candidates"];
}

/** Assemble code_orientation details before presentation adapters render content. */
export function assembleOrientationDetails(input: OrientationDetailsInput): ContextDetails {
  return {
    confidence: input.confidence,
    task: input.task ?? null,
    focusTarget: input.focusTarget ?? null,
    requestedSections: input.requestedSections ?? [],
    renderedSections: input.renderedSections ?? [],
    omittedCount: input.omittedCount ?? 0,
    nextQueries: input.nextQueries,
    target: input.target,
    candidates: input.candidates,
  };
}
