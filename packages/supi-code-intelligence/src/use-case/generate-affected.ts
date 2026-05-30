// Compatibility wrapper for the historical `code_affected` surface.
// The shared impact engine now lives in generate-impact.ts.

import type { CodeIntelResult } from "../types.ts";
import {
  type ImpactDeps as AffectedDeps,
  type ImpactInput as AffectedInput,
  executeImpact,
} from "./generate-impact.ts";

export type { AffectedDeps, AffectedInput };

/** Execute the compatibility `code_affected` use-case through the shared impact engine. */
export async function executeAffected(
  input: AffectedInput,
  deps: AffectedDeps,
): Promise<CodeIntelResult> {
  return executeImpact(input, deps, "affected");
}
