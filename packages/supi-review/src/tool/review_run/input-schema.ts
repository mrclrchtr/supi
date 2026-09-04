import { Type } from "typebox";
import { Value } from "typebox/value";
import { REVIEW_LIMITS } from "../../review-limits.ts";
import { normalizeReviewScope } from "../../review-scope.ts";
import { normalizeReviewTarget, reviewTargetEndpoints } from "../../target/input.ts";
import type { ReviewInput, ReviewScope, ReviewTargetSpec } from "../../types.ts";
import { reviewInputSchema } from "./schemas.ts";

function endpointSchema() {
  return Type.String({
    minLength: 1,
    maxLength: 512,
    pattern: "^\\S+$",
  });
}

const scopePathsSchema = Type.Array(
  Type.String({
    minLength: 1,
    maxLength: REVIEW_LIMITS.reviewScopePathCharacters,
    pattern: "\\S",
    description: "Repository-relative path in the frozen after state; a leading @ is accepted.",
  }),
  {
    minItems: 1,
    maxItems: REVIEW_LIMITS.reviewScopePathsPerTarget,
    description:
      "Advisory focus for all tasks; it does not limit inspection, changed-path evidence, or findings.",
  },
);

const workingTreeTargetSchema = Type.Object(
  {
    from: Type.Optional(endpointSchema()),
  },
  {
    additionalProperties: false,
    description:
      "Freeze the current filesystem, including staged, unstaged, and non-ignored untracked files; from selects the before commit.",
  },
);

const committedTargetSchema = Type.Object(
  {
    from: Type.Optional(endpointSchema()),
    to: Type.Optional(endpointSchema()),
  },
  {
    additionalProperties: false,
    description:
      "Freeze committed state; from and to select before and after commits. The to endpoint defaults to HEAD. Change tasks require from and cannot use a root commit as to.",
  },
);

const targetSchema = Type.Object(
  {
    workingTree: Type.Optional(workingTreeTargetSchema),
    committed: Type.Optional(committedTargetSchema),
  },
  {
    maxProperties: 1,
    additionalProperties: false,
    description:
      "Omit target or use {} for the current filesystem; otherwise select workingTree or committed. All-state batches must omit from. Endpoints must resolve to commits; ranges, trees, and blobs are invalid.",
  },
);

/** Object-rooted provider-compatible schema for caller-defined Review execution. */
export const runReviewSchema = Type.Object(
  {
    target: Type.Optional(targetSchema),
    paths: Type.Optional(scopePathsSchema),
    ...reviewInputSchema.properties,
  },
  { additionalProperties: false },
);

interface RawRunReviewInput extends ReviewInput {
  target?: ReviewTargetSpec;
  paths?: string[];
}

export interface RunReviewToolInput {
  target: ReviewTargetSpec;
  scope: ReviewScope;
  review: ReviewInput;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oldTargetError(target: unknown): Error | undefined {
  if (!isRecord(target)) return undefined;
  const oldTarget = [
    "from",
    "to",
    "includeUncommittedChanges",
    "comparison",
    "commit",
    "currentState",
    "kind",
  ].some((key) => key in target);
  return oldTarget
    ? new Error("Review Target must select a workingTree or committed target object.")
    : undefined;
}

function targetShapeError(target: unknown): Error | undefined {
  if (target === undefined) return undefined;
  try {
    normalizeReviewTarget(target as ReviewTargetSpec);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error : new Error("Invalid Review Target.");
  }
}

function pathsInsideTargetError(target: unknown): Error | undefined {
  if (!isRecord(target)) return undefined;
  return "paths" in target
    ? new Error("Review paths must be a top-level argument, not part of the Review Target.")
    : undefined;
}

function taskModeError(tasks: unknown): Error | undefined {
  if (!Array.isArray(tasks)) return undefined;
  for (const task of tasks) {
    if (!isRecord(task)) continue;
    if ("findingScope" in task) {
      return new Error("Review task findingScope is removed; set mode to change or state.");
    }
    if ("criteriaOnly" in task || "scope" in task) {
      return new Error("Review task Finding Scope is removed; set mode to change or state.");
    }
    if (!("mode" in task)) return new Error("Review task mode is required: change or state.");
  }
  return undefined;
}

function invalidInputError(input: unknown): Error {
  if (!isRecord(input)) return new Error("Invalid review execution input.");
  if ("direct" in input) return new Error("Review input must not use the removed direct wrapper.");
  if (
    ["prepared", "plan", "planId", "draftDecision", "planning", "preparation", "prepare"].some(
      (field) => field in input,
    )
  ) {
    return new Error("Review input must not use removed Prepared Review fields.");
  }
  if ("findingScope" in input || "mode" in input) {
    return new Error("Review input must not use removed Finding Scope fields.");
  }
  return (
    oldTargetError(input.target) ??
    pathsInsideTargetError(input.target) ??
    targetShapeError(input.target) ??
    taskModeError(input.tasks) ??
    new Error("Invalid review execution input.")
  );
}

function normalizeTarget(target: ReviewTargetSpec | undefined): ReviewTargetSpec {
  return normalizeReviewTarget(target);
}

/** Validate and narrow a caller-defined Review request after provider-level JSON parsing. */
export function parseRunReviewToolInput(input: unknown): RunReviewToolInput {
  if (!Value.Check(runReviewSchema, input)) throw invalidInputError(input);
  const parsed = input as RawRunReviewInput;
  const { target, paths, ...review } = parsed;
  const normalizedTarget = normalizeTarget(target);
  const scope = normalizeReviewScope(paths ? { paths } : undefined);
  const endpoints = reviewTargetEndpoints(normalizedTarget);
  const change = review.tasks.some((task) => task.mode === "change");
  if (!change && endpoints.from !== undefined) {
    throw new Error("Review Targets for all-state tasks must not set from.");
  }
  if (endpoints.kind === "committed" && change && endpoints.from === undefined) {
    throw new Error("A committed change Review Target requires an explicit from endpoint.");
  }
  return { target: normalizedTarget, scope, review };
}
