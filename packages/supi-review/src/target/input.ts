import type { CommittedReviewTarget, ReviewTargetSpec, WorkingTreeReviewTarget } from "../types.ts";

const TARGET_FIELDS = new Set(["workingTree", "committed"]);
const WORKING_TREE_FIELDS = new Set(["from"]);
const COMMITTED_FIELDS = new Set(["from", "to"]);

/** Source selected by a public Review Target. */
export type ReviewTargetKind = "workingTree" | "committed";

/** Normalized endpoints and source kind used by the Review Engine. */
export interface ReviewTargetEndpoints {
  kind: ReviewTargetKind;
  from?: string;
  to?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnsupportedFields(
  value: Record<string, unknown>,
  allowedFields: Set<string>,
  label: string,
): void {
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) throw new Error(`${label} field ${field} is not supported.`);
  }
}

function normalizeEndpoint(
  value: unknown,
  kind: ReviewTargetKind,
  name: "from" | "to",
): string | undefined {
  if (value === undefined) return undefined;
  const label = `Review Target ${kind}.${name}`;
  if (typeof value !== "string") throw new Error(`${label} must be a Git revision string.`);
  const endpoint = value.trim();
  if (!endpoint) throw new Error(`${label} must not be blank.`);
  if (/\s/u.test(value)) throw new Error(`${label} must not contain whitespace.`);
  return endpoint;
}

function normalizeWorkingTreeTarget(value: unknown): WorkingTreeReviewTarget {
  if (!isRecord(value)) throw new Error("Review Target workingTree must be an object.");
  rejectUnsupportedFields(value, WORKING_TREE_FIELDS, "Review Target workingTree");
  const from = normalizeEndpoint(value.from, "workingTree", "from");
  return from === undefined ? {} : { from };
}

function normalizeCommittedTarget(value: unknown): CommittedReviewTarget {
  if (!isRecord(value)) throw new Error("Review Target committed must be an object.");
  rejectUnsupportedFields(value, COMMITTED_FIELDS, "Review Target committed");
  const from = normalizeEndpoint(value.from, "committed", "from");
  const to = normalizeEndpoint(value.to, "committed", "to");
  return {
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
  };
}

/** Canonicalize and validate one public Review Target source selection. */
export function normalizeReviewTarget(target: ReviewTargetSpec | undefined = {}): ReviewTargetSpec {
  if (!isRecord(target)) throw new Error("Review Target must be an object.");
  rejectUnsupportedFields(target, TARGET_FIELDS, "Review Target");
  const fields = Object.keys(target);
  if (fields.length > 1) {
    throw new Error("Review Target must select at most one of workingTree or committed.");
  }
  if ("workingTree" in target)
    return { workingTree: normalizeWorkingTreeTarget(target.workingTree) };
  if ("committed" in target) return { committed: normalizeCommittedTarget(target.committed) };
  return {};
}

/** Return the endpoint syntax and source kind for a canonical Review Target. */
export function reviewTargetEndpoints(target: ReviewTargetSpec): ReviewTargetEndpoints {
  if (target.committed !== undefined) {
    return {
      kind: "committed",
      ...(target.committed.from === undefined ? {} : { from: target.committed.from }),
      ...(target.committed.to === undefined ? {} : { to: target.committed.to }),
    };
  }
  return {
    kind: "workingTree",
    ...(target.workingTree?.from === undefined ? {} : { from: target.workingTree.from }),
  };
}
