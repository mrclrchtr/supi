import { Type } from "typebox";
import { Value } from "typebox/value";
import { REVIEW_LIMITS } from "../../review-limits.ts";
import { normalizeReviewScope } from "../../review-scope.ts";
import { normalizeReviewTarget, reviewTargetEndpoints } from "../../target/input.ts";
import type { ReviewInput, ReviewScope, ReviewTargetSpec } from "../../types.ts";
import { reviewInputSchema } from "./schemas.ts";

function endpointSchema(role: "before" | "after") {
  return Type.String({
    minLength: 1,
    maxLength: 512,
    pattern: "^\\S+$",
    description: `Git revision for the exact ${role} state. Branches, hashes, ~, ^, and lightweight or annotated tags are valid. It must resolve to one commit; whitespace, ranges, trees, blobs, and blank values are not valid.`,
  });
}

const scopePathsSchema = Type.Array(
  Type.String({
    minLength: 1,
    maxLength: REVIEW_LIMITS.reviewScopePathCharacters,
    pattern: "\\S",
    description:
      "Repository-relative path that focuses every Review Task. A leading @ is accepted. The path must exist in the frozen after state.",
  }),
  {
    minItems: 1,
    maxItems: REVIEW_LIMITS.reviewScopePathsPerTarget,
    description:
      "Optional advisory path focus for this batch. This argument sits at the top level of the tool call, alongside target; do not place it inside target. It does not limit repository inspection, changed-path evidence, or findings.",
  },
);

const workingTreeTargetSchema = Type.Object(
  {
    from: Type.Optional(endpointSchema("before")),
  },
  {
    additionalProperties: false,
    description:
      "Review the frozen current filesystem, including staged, unstaged, and non-ignored untracked files. Optional from sets the committed before state.",
  },
);

const committedTargetSchema = Type.Object(
  {
    from: Type.Optional(endpointSchema("before")),
    to: Type.Optional(endpointSchema("after")),
  },
  {
    additionalProperties: false,
    description:
      "Review exact committed Git state. Optional from and to select the before and after commits; to defaults to HEAD.",
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
      "Exact Review Target. Omit it, or use {}, for the current filesystem. Select workingTree or committed; endpoints resolve once to full commits.",
  },
);

/** Object-rooted provider-compatible schema for caller-defined Review execution. */
export const runReviewSchema = Type.Object(
  {
    target: Type.Optional(targetSchema),
    paths: Type.Optional(scopePathsSchema),
    ...reviewInputSchema.properties,
  },
  {
    additionalProperties: false,
    description: "Run one complete caller-defined Review against one exact Review Target.",
  },
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
