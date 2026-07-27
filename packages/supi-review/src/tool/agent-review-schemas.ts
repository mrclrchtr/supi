import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";
import type { ReviewInput, ReviewTargetSpec } from "../types.ts";
import { reviewInputSchema } from "./schemas.ts";

const commitId = Type.String({
  minLength: 40,
  maxLength: 64,
  pattern: "^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$",
  description: "Full hexadecimal Git commit object id (40 or 64 characters).",
});
const targetSchema = Type.Object(
  {
    kind: StringEnum(["working-tree", "comparison", "commit"] as const),
    baseCommit: Type.Optional(commitId),
    commit: Type.Optional(commitId),
  },
  { additionalProperties: false, description: "Git change to review." },
);

export const prepareReviewSchema = Type.Object(
  {
    target: Type.Optional(targetSchema),
    planning: Type.Optional(
      StringEnum(["none", "suggest"] as const, {
        default: "none",
        description: "Whether the advisory Planner should suggest review tasks.",
      }),
    ),
  },
  { additionalProperties: false },
);

const preparedDecisionSchema = Type.Object(
  {
    kind: StringEnum(["accept-draft", "use-review"] as const),
    review: Type.Optional(reviewInputSchema),
  },
  { additionalProperties: false, description: "Explicit one-shot Prepared Review decision." },
);

/** Object-rooted provider-compatible schema; semantic mode combinations are parsed at runtime. */
export const runReviewSchema = Type.Object(
  {
    mode: StringEnum(["direct", "prepared"] as const),
    target: Type.Optional(targetSchema),
    review: Type.Optional(reviewInputSchema),
    planId: Type.Optional(Type.String({ minLength: 1, description: "Session-scoped plan id." })),
    decision: Type.Optional(preparedDecisionSchema),
  },
  { additionalProperties: false, description: "Direct or Prepared Review execution request." },
);

type RawPrepareReviewInput = Static<typeof prepareReviewSchema>;
type RawRunReviewInput = Static<typeof runReviewSchema>;

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

function parseTarget(input: {
  kind: "working-tree" | "comparison" | "commit";
  baseCommit?: string;
  commit?: string;
}): ReviewTargetSpec {
  if (input.kind === "working-tree") {
    return { kind: "working-tree" };
  }
  if (input.kind === "comparison") {
    if (!input.baseCommit) {
      throw new Error(`Comparison targets require a baseCommit (full 40- or 64-char commit id).`);
    }
    return { kind: "comparison", baseCommit: input.baseCommit };
  }
  if (input.kind === "commit") {
    if (!input.commit) {
      throw new Error(`Commit targets require a commit field (full 40- or 64-char commit id).`);
    }
    return { kind: "commit", commit: input.commit };
  }
  throw new Error(`Unknown target kind "${input.kind}".`);
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

/** Validate and narrow object-rooted parameters into the exact Direct/Prepared contract. */
export function parseRunReviewToolInput(input: unknown): RunReviewToolInput {
  if (!Value.Check(runReviewSchema, input)) throw new Error("Invalid review execution input.");
  const parsed = input as RawRunReviewInput;
  if (parsed.mode === "direct") {
    if (!parsed.target || !parsed.review || parsed.planId || parsed.decision) {
      throw new Error("Direct Review requires only target and review.");
    }
    return { mode: "direct", target: parseTarget(parsed.target), review: parsed.review };
  }
  if (!parsed.planId || !parsed.decision || parsed.target || parsed.review) {
    throw new Error("Prepared Review requires only planId and decision.");
  }
  if (parsed.decision.kind === "accept-draft" && !parsed.decision.review) {
    return { mode: "prepared", planId: parsed.planId, decision: { kind: "accept-draft" } };
  }
  if (parsed.decision.kind === "use-review" && parsed.decision.review) {
    return {
      mode: "prepared",
      planId: parsed.planId,
      decision: { kind: "use-review", review: parsed.decision.review },
    };
  }
  throw new Error(`Decision fields do not match decision kind "${parsed.decision.kind}".`);
}
