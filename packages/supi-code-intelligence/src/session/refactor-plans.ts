/**
 * Refactor plan storage — per-session map for plan id → plan data.
 *
 * Plans are stored in-memory on the WorkspaceSession for the session lifetime.
 * The store map is passed in from the caller; this module provides pure
 * functions without module-level state.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type {
  RefactorActionIdentity,
  RefactorOperation,
  WorkspaceEdit,
} from "@mrclrchtr/supi-code-runtime/api";
import { toDisplayPath } from "../analysis/search/paths.ts";
import type { PublicSourceRange } from "./refactor-types.ts";

export interface RefactorPlan {
  id: string;
  operation: RefactorOperation;
  /** Absolute file the operation was requested for. */
  file: string;
  /** `rename_symbol`: the requested name. */
  newName?: string;
  /** `rename_symbol`: one-based target position in `file`. */
  target?: { line: number; character: number };
  /** `code_action`: the one-based requested range in `file`. */
  range?: PublicSourceRange;
  /** `code_action` / `source_action`: the selected server action. */
  action?: RefactorActionIdentity;
  edits: WorkspaceEdit;
  /** Evidence source used to compose this plan. */
  evidenceSource?: "semantic" | "structural";
  /** Canonical roots that authorize the plan's files. */
  authorizedMutationRoots: string[];
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

/** Check that request-scoped content evidence still matches the plan inputs. */
export function validateSynchronizedContentFingerprints(
  preconditions: WorkspaceEdit["documentPreconditions"],
  fileFingerprints: readonly { file: string; fingerprint: string }[],
  cwd: string,
): string | null {
  const fingerprints = new Map(
    fileFingerprints.map(({ file, fingerprint }) => [file, fingerprint]),
  );
  for (const precondition of preconditions ?? []) {
    if (precondition.kind !== "open-document-content") continue;
    if (fingerprints.get(precondition.file) !== precondition.fingerprint) {
      return `File ${toDisplayPath(cwd, precondition.file)} changed after the semantic input snapshot. Request a new rename plan.`;
    }
  }
  return null;
}

/** Generate a plan id from operation details and a time discriminator. */
export function generatePlanId(operation: string, file: string, discriminator: string): string {
  const hash = createHash("sha256")
    .update(`${operation}:${file}:${discriminator}:${Date.now()}`)
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
  cwd: string,
): { fresh: true } | { fresh: false; reason: string } {
  for (const fp of plan.fileFingerprints) {
    const current = computeFileFingerprint(fp.file);
    if (current !== fp.fingerprint) {
      return {
        fresh: false,
        reason: `File ${toDisplayPath(cwd, fp.file)} has changed since the plan was generated. Regenerate with code_refactor_plan.`,
      };
    }
  }
  return { fresh: true };
}
