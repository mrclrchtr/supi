import { StringEnum } from "@earendil-works/pi-ai";
import { type TSchema, Type } from "typebox";
import { Value } from "typebox/value";
import { REVIEW_LIMITS } from "../review-limits.ts";
import type { ReviewInput, ReviewTargetSpec } from "../types.ts";
import { reviewInputSchema } from "./schemas.ts";

/** Build a provider-compatible selector that accepts exactly one named payload. */
function exactOneSelector(properties: Record<string, TSchema>, description: string): TSchema {
  const optionalProperties: Record<string, TSchema> = {};
  for (const [key, schema] of Object.entries(properties)) {
    optionalProperties[key] = Type.Optional(schema);
  }
  return Type.Object(optionalProperties, {
    additionalProperties: false,
    minProperties: 1,
    maxProperties: 1,
    description,
  });
}

const commitId = {
  minLength: 7,
  maxLength: 64,
  pattern: "^[0-9a-fA-F]{7,64}$",
} as const;
const targetSchema = exactOneSelector(
  {
    workingTree: Type.Object(
      {
        baseCommit: Type.Optional(
          Type.String({
            ...commitId,
            description:
              "Optional base commit hash. Omit to compare the current filesystem with HEAD; set to include committed branch work since merge-base(baseCommit, HEAD).",
          }),
        ),
      },
      {
        additionalProperties: false,
        description:
          "Review current filesystem changes, including non-ignored untracked files. Omit baseCommit to compare with HEAD.",
      },
    ),
    comparison: Type.Object(
      {
        baseCommit: Type.String({
          ...commitId,
          description:
            "Base commit hash. Review committed changes from merge-base(baseCommit, HEAD) through HEAD; current filesystem changes are excluded.",
        }),
      },
      { additionalProperties: false, description: "Review committed work since a base commit." },
    ),
    commit: Type.Object(
      {
        commit: Type.String({
          ...commitId,
          description: "Commit to review against its first parent.",
        }),
      },
      { additionalProperties: false, description: "Review one commit." },
    ),
    currentState: Type.Object(
      {
        paths: Type.Optional(
          Type.Array(
            Type.String({
              minLength: 1,
              maxLength: REVIEW_LIMITS.reviewScopePathCharacters,
              pattern: "\\S",
              description: "Workspace-relative file or directory path.",
            }),
            {
              minItems: 1,
              maxItems: REVIEW_LIMITS.reviewScopePathsPerTarget,
              description:
                "Advisory Review Scope focus; every path must exist in the frozen state. Omit for repository-wide discovery.",
            },
          ),
        ),
      },
      {
        additionalProperties: false,
        description:
          "Audit the complete current filesystem, including uncommitted and untracked work, against Review Criteria without Git-change attribution.",
      },
    ),
  },
  "Exactly one review target: workingTree, comparison, commit, or currentState.",
);

export const prepareReviewSchema = Type.Object(
  {
    target: Type.Optional(targetSchema),
    planning: Type.Optional(
      StringEnum(["none", "suggest"] as const, {
        default: "none",
        description:
          "none creates a plan without drafting tasks; suggest asks the advisory Planner to draft tasks from bounded context and target metadata.",
      }),
    ),
  },
  {
    additionalProperties: false,
    description: "Prepare a Review Plan; target defaults to workingTree when omitted.",
  },
);

const directRunSchema = Type.Object(
  {
    target: Type.Optional(targetSchema),
    ...reviewInputSchema.properties,
  },
  {
    additionalProperties: false,
    description:
      "Run a complete caller-defined task set; target defaults to workingTree when omitted.",
  },
);

const draftDecisionSchema = exactOneSelector(
  {
    useDraft: Type.Object(
      {},
      {
        additionalProperties: false,
        description: "Use the Planner Draft unchanged; valid only when preparation returned one.",
      },
    ),
    replaceDraft: Type.Object(reviewInputSchema.properties, {
      additionalProperties: false,
      description:
        "Supply the complete replacement task set when no draft was returned or the draft needs changes.",
    }),
  },
  "Exactly one Planner Draft decision: useDraft or replaceDraft.",
);

const preparedRunSchema = Type.Object(
  {
    planId: Type.String({
      minLength: 1,
      maxLength: 128,
      description: "Session-scoped one-shot plan id returned by supi_review_prepare.",
    }),
    draftDecision: draftDecisionSchema,
  },
  {
    additionalProperties: false,
    description:
      "Execute one prepared Review Plan with an explicit decision about its Planner Draft.",
  },
);

/** Object-rooted provider-compatible schema for the two exact-one execution paths. */
export const runReviewSchema = exactOneSelector(
  {
    direct: directRunSchema,
    prepared: preparedRunSchema,
  },
  "Exactly one execution path: direct supplies Review Tasks and an optional target; prepared supplies a plan id and draft decision.",
);

type RawTarget =
  | {
      workingTree: { baseCommit?: string };
      comparison?: never;
      commit?: never;
      currentState?: never;
    }
  | {
      workingTree?: never;
      comparison: { baseCommit: string };
      commit?: never;
      currentState?: never;
    }
  | { workingTree?: never; comparison?: never; commit: { commit: string }; currentState?: never }
  | { workingTree?: never; comparison?: never; commit?: never; currentState: { paths?: string[] } };
type RawReviewInput = ReviewInput;
interface RawPrepareReviewInput {
  target?: RawTarget;
  planning?: "none" | "suggest";
}
interface RawRunReviewInput {
  direct?: RawReviewInput & { target?: RawTarget };
  prepared?: {
    planId: string;
    draftDecision:
      | { useDraft: Record<string, never>; replaceDraft?: never }
      | { useDraft?: never; replaceDraft: RawReviewInput };
  };
}

export interface PrepareReviewToolInput {
  target?: ReviewTargetSpec;
  planning?: "none" | "suggest";
}

export type RunReviewToolInput =
  | { mode: "direct"; target: ReviewTargetSpec; review: ReviewInput }
  | {
      mode: "prepared";
      planId: string;
      decision: { kind: "accept-draft" } | { kind: "use-review"; review: ReviewInput };
    };

function parseTarget(input: RawTarget): ReviewTargetSpec {
  if (input.workingTree !== undefined) {
    return {
      kind: "working-tree",
      ...(input.workingTree.baseCommit ? { baseCommit: input.workingTree.baseCommit } : {}),
    };
  }
  if (input.comparison !== undefined) {
    return { kind: "comparison", baseCommit: input.comparison.baseCommit };
  }
  if (input.commit !== undefined) {
    return { kind: "commit", commit: input.commit.commit };
  }
  if (input.currentState !== undefined) {
    const paths = input.currentState.paths?.map((path) => path.trim()).filter(Boolean);
    if (paths && paths.length === 0) throw new Error("Choose one review target.");
    return { kind: "current-state", ...(paths ? { paths } : {}) };
  }
  throw new Error("Choose one review target.");
}

function toReviewInput(input: RawReviewInput): ReviewInput {
  return input;
}

/** Validate and narrow preparation input after provider-level JSON parsing. */
export function parsePrepareReviewToolInput(input: unknown): PrepareReviewToolInput {
  if (!Value.Check(prepareReviewSchema, input))
    throw new Error("Invalid review preparation input.");
  const parsed = input as RawPrepareReviewInput;
  return {
    ...(parsed.target ? { target: parseTarget(parsed.target) } : {}),
    ...(parsed.planning ? { planning: parsed.planning } : {}),
  };
}

/** Validate and narrow exact-one execution paths into the internal Review Engine contract. */
export function parseRunReviewToolInput(input: unknown): RunReviewToolInput {
  if (!Value.Check(runReviewSchema, input)) throw new Error("Invalid review execution input.");
  const parsed = input as RawRunReviewInput;
  if (parsed.direct !== undefined) {
    const { target, ...review } = parsed.direct;
    return {
      mode: "direct",
      target: target ? parseTarget(target) : { kind: "working-tree" },
      review: toReviewInput(review),
    };
  }

  const prepared = parsed.prepared;
  if (!prepared) throw new Error("Choose one review execution path.");
  if (prepared.draftDecision.useDraft !== undefined) {
    return { mode: "prepared", planId: prepared.planId, decision: { kind: "accept-draft" } };
  }
  if (prepared.draftDecision.replaceDraft !== undefined) {
    return {
      mode: "prepared",
      planId: prepared.planId,
      decision: {
        kind: "use-review",
        review: toReviewInput(prepared.draftDecision.replaceDraft),
      },
    };
  }
  throw new Error("Choose one Planner Draft decision.");
}
