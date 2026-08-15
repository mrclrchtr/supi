import { Type } from "typebox";
import { Value } from "typebox/value";
import { REVIEW_LIMITS } from "../review-limits.ts";
import { normalizeReviewScope } from "../review-scope.ts";
import type { ReviewInput, ReviewScope, ReviewTargetSpec } from "../types.ts";
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

const targetSchema = Type.Object(
  {
    from: Type.Optional(endpointSchema("before")),
    to: Type.Optional(endpointSchema("after")),
    includeUncommittedChanges: Type.Optional(
      Type.Boolean({
        default: true,
        description:
          "Include the current filesystem and non-ignored untracked files. Defaults to true. When true, omit to.",
      }),
    ),
  },
  {
    additionalProperties: false,
    description:
      "Exact Review Target. Omit it, or use {}, for the current filesystem. Endpoints resolve once to full commits.",
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

function blankEndpointError(target: unknown): Error | undefined {
  if (!isRecord(target)) return undefined;
  for (const name of ["from", "to"] as const) {
    const endpoint = target[name];
    if (typeof endpoint === "string" && !endpoint.trim()) {
      return new Error(`Review Target ${name} must not be blank.`);
    }
  }
  return undefined;
}

function oldTargetError(target: unknown): Error | undefined {
  if (!isRecord(target)) return undefined;
  const oldTarget = ["workingTree", "comparison", "commit", "currentState", "kind"].some(
    (key) => key in target,
  );
  return oldTarget
    ? new Error("Review Target must use only from, to, and includeUncommittedChanges.")
    : undefined;
}

function pathsInsideTargetError(target: unknown): Error | undefined {
  if (!isRecord(target)) return undefined;
  return "paths" in target
    ? new Error("Review paths must be a top-level argument, not part of the Review Target.")
    : undefined;
}

function endpointWhitespaceError(target: unknown): Error | undefined {
  if (!isRecord(target)) return undefined;
  for (const name of ["from", "to"] as const) {
    const endpoint = target[name];
    if (typeof endpoint === "string" && /\s/u.test(endpoint) && endpoint.trim()) {
      return new Error(`Review Target ${name} must not contain whitespace.`);
    }
  }
  return undefined;
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
    blankEndpointError(input.target) ??
    endpointWhitespaceError(input.target) ??
    oldTargetError(input.target) ??
    pathsInsideTargetError(input.target) ??
    taskModeError(input.tasks) ??
    new Error("Invalid review execution input.")
  );
}

function normalizeTarget(target: ReviewTargetSpec | undefined): ReviewTargetSpec {
  if (!target) return {};
  const from = target.from?.trim();
  const to = target.to?.trim();
  if (target.from !== undefined && !from) throw new Error("Review Target from must not be blank.");
  if (target.to !== undefined && !to) throw new Error("Review Target to must not be blank.");
  if (target.from !== undefined && /\s/u.test(target.from)) {
    throw new Error("Review Target from must not contain whitespace.");
  }
  if (target.to !== undefined && /\s/u.test(target.to)) {
    throw new Error("Review Target to must not contain whitespace.");
  }
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(target.includeUncommittedChanges !== undefined
      ? { includeUncommittedChanges: target.includeUncommittedChanges }
      : {}),
  };
}

/** Validate and narrow a caller-defined Review request after provider-level JSON parsing. */
export function parseRunReviewToolInput(input: unknown): RunReviewToolInput {
  if (!Value.Check(runReviewSchema, input)) throw invalidInputError(input);
  const parsed = input as RawRunReviewInput;
  const { target, paths, ...review } = parsed;
  const normalizedTarget = normalizeTarget(target);
  const scope = normalizeReviewScope(paths ? { paths } : undefined);
  const includeUncommittedChanges = normalizedTarget.includeUncommittedChanges ?? true;
  if (includeUncommittedChanges && normalizedTarget.to !== undefined) {
    throw new Error("Review Target to is not valid when includeUncommittedChanges is true.");
  }
  const change = review.tasks.some((task) => task.mode === "change");
  if (!change && normalizedTarget.from !== undefined) {
    throw new Error("Review Targets for all-state tasks must not set from.");
  }
  if (!includeUncommittedChanges && change && normalizedTarget.from === undefined) {
    throw new Error("A committed change Review Target requires an explicit from endpoint.");
  }
  return { target: normalizedTarget, scope, review };
}
