/**
 * Refactor plan storage — per-session map for plan id → plan data.
 *
 * Plans are stored in-memory on the WorkspaceSession for the session lifetime.
 * The store map is passed in from the caller; this module provides pure
 * functions without module-level state.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { RefactorOperation, WorkspaceEdit } from "@mrclrchtr/supi-code-runtime/api";

export interface RefactorPlan {
  id: string;
  operation: Exclude<RefactorOperation, "rename">;
  newName?: string;
  destination?: string;
  targetFile: string;
  targetLine: number;
  targetCharacter: number;
  edits: WorkspaceEdit;
  fileFingerprints: Array<{ file: string; fingerprint: string }>;
  createdAt: number;
}

/** Compute a SHA-256 hex fingerprint for a file's current contents. */
export function computeFileFingerprint(file: string): string {
  try {
    const content = readFileSync(file, "utf-8");
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return "unreadable";
  }
}

/** Generate a stable plan id from operation details. */
// biome-ignore lint/complexity/useMaxParams: plan id construction needs all positional args
export function generatePlanId(
  operation: string,
  file: string,
  line: number,
  character: number,
  discriminator: string = "",
): string {
  const hash = createHash("sha256")
    .update(`${operation}:${file}:${line}:${character}:${discriminator}:${Date.now()}`)
    .digest("hex")
    .slice(0, 12);
  return `plan-${hash}`;
}

/** Store a plan in the given session-scoped map and return its id. */
export function storePlan(store: Map<string, RefactorPlan>, plan: RefactorPlan): string {
  store.set(plan.id, plan);
  return plan.id;
}

/** Retrieve a plan by id from the given session-scoped map, or undefined if not found. */
export function getPlan(store: Map<string, RefactorPlan>, id: string): RefactorPlan | undefined {
  return store.get(id);
}

/** Remove a plan from the given session-scoped map after successful apply. */
export function removePlan(store: Map<string, RefactorPlan>, id: string): void {
  store.delete(id);
}

/** Check if a plan is still fresh (all file fingerprints match). */
export function isPlanFresh(
  plan: RefactorPlan,
): { fresh: true } | { fresh: false; reason: string } {
  for (const fp of plan.fileFingerprints) {
    const current = computeFileFingerprint(fp.file);
    if (current !== fp.fingerprint) {
      return {
        fresh: false,
        reason: `File ${fp.file} has changed since the plan was generated. Regenerate with code_refactor_plan.`,
      };
    }
  }
  return { fresh: true };
}
