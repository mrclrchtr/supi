/**
 * Refactor plan storage — module-level map for plan id → plan data.
 *
 * Plans are stored in-memory for the session lifetime.
 * In a future iteration, plans could be persisted through pi's
 * session entries so they survive reloads.
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

const plans = new Map<string, RefactorPlan>();

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

/** Store a plan and return its id. */
export function storePlan(plan: RefactorPlan): string {
  plans.set(plan.id, plan);
  return plan.id;
}

/** Retrieve a plan by id, or undefined if not found. */
export function getPlan(id: string): RefactorPlan | undefined {
  return plans.get(id);
}

/** Remove a plan after successful apply. */
export function removePlan(id: string): void {
  plans.delete(id);
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
