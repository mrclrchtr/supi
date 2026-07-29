import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";
import type { ReviewInput, ReviewTargetSpec } from "../types.ts";
import { reviewInputSchema } from "./schemas.ts";

const commitId = Type.String({
  minLength: 7,
  maxLength: 64,
  pattern: "^[0-9a-fA-F]{7,64}$",
  description:
    "Git commit hash (7-64 hex characters). Short hashes are resolved to full commit ids.",
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
    planId: Type.Optional(
      Type.String({ minLength: 1, maxLength: 128, description: "Session-scoped plan id." }),
    ),
    decision: Type.Optional(preparedDecisionSchema),
    audit: Type.Optional(
      StringEnum(["local-replay"] as const, {
        description:
          "Explicitly record this run as a protected local reviewer replay when review.auditEnabled is on.",
      }),
    ),
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
  | { mode: "direct"; target: ReviewTargetSpec; review: ReviewInput; audit?: "local-replay" }
  | {
      mode: "prepared";
      planId: string;
      decision: { kind: "accept-draft" } | { kind: "use-review"; review: ReviewInput };
      audit?: "local-replay";
    };

function parseTarget(input: {
  kind: "working-tree" | "comparison" | "commit";
  baseCommit?: string;
  commit?: string;
}): ReviewTargetSpec {
  if (input.kind === "working-tree") {
    return {
      kind: "working-tree",
      ...(input.baseCommit ? { baseCommit: input.baseCommit } : {}),
    };
  }
  if (input.kind === "comparison") {
    if (!input.baseCommit) {
      throw new Error("Comparison targets require a baseCommit (7-64 hexadecimal characters).");
    }
    return { kind: "comparison", baseCommit: input.baseCommit };
  }
  if (input.kind === "commit") {
    if (!input.commit) {
      throw new Error("Commit targets require a commit field (7-64 hexadecimal characters).");
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

function auditOption(parsed: RawRunReviewInput): { audit?: "local-replay" } {
  return parsed.audit ? { audit: parsed.audit } : {};
}

function parseDirectRun(parsed: RawRunReviewInput): RunReviewToolInput {
  if (!parsed.target || !parsed.review || parsed.planId || parsed.decision) {
    throw new Error("Direct Review requires only target and review.");
  }
  return {
    mode: "direct",
    target: parseTarget(parsed.target),
    review: parsed.review,
    ...auditOption(parsed),
  };
}

function parsePreparedRun(parsed: RawRunReviewInput): RunReviewToolInput {
  if (!parsed.planId || !parsed.decision || parsed.target || parsed.review) {
    throw new Error("Prepared Review requires only planId and decision.");
  }
  if (parsed.decision.kind === "accept-draft" && !parsed.decision.review) {
    return {
      mode: "prepared",
      planId: parsed.planId,
      decision: { kind: "accept-draft" },
      ...auditOption(parsed),
    };
  }
  if (parsed.decision.kind === "use-review" && parsed.decision.review) {
    return {
      mode: "prepared",
      planId: parsed.planId,
      decision: { kind: "use-review", review: parsed.decision.review },
      ...auditOption(parsed),
    };
  }
  throw new Error(`Decision fields do not match decision kind "${parsed.decision.kind}".`);
}

/** Validate and narrow object-rooted parameters into the exact Direct/Prepared contract. */
export function parseRunReviewToolInput(input: unknown): RunReviewToolInput {
  if (!Value.Check(runReviewSchema, input)) throw new Error("Invalid review execution input.");
  const parsed = input as RawRunReviewInput;
  return parsed.mode === "direct" ? parseDirectRun(parsed) : parsePreparedRun(parsed);
}
