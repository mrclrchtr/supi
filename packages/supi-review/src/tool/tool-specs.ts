import { Type } from "typebox";
import { runReviewSchema } from "./agent-review-schemas.ts";
import { MAX_PAGE_CHARACTERS, MAX_PAGE_LINES, MIN_PAGE_CHARACTERS } from "./output-page.ts";
import { plannerDraftSchema, reviewSubmissionSchema } from "./schemas.ts";

const pageOffsetSchema = Type.Optional(
  Type.Integer({
    minimum: 0,
    default: 0,
    description: "UTF-16 character offset; omit for the first page, then use returned nextOffset.",
  }),
);

const pageLimitSchema = Type.Optional(
  Type.Integer({
    minimum: MIN_PAGE_CHARACTERS,
    maximum: MAX_PAGE_CHARACTERS,
    default: MAX_PAGE_CHARACTERS,
    description: `Maximum characters for this page (${MIN_PAGE_CHARACTERS}-${MAX_PAGE_CHARACTERS}); omit for the default.`,
  }),
);

const outputPageSchema = Type.Object(
  {
    artifactId: Type.String({
      minLength: 1,
      maxLength: 128,
      description:
        "Opaque current-process id returned by supi_review_run or /supi-review, not a file path.",
    }),
    offset: pageOffsetSchema,
    limit: pageLimitSchema,
  },
  {
    additionalProperties: false,
    description: "Read one page of an artifact from an agent or interactive Review.",
  },
);

const declineReviewRecoverySchema = Type.Object(
  {
    reason: Type.String({
      minLength: 1,
      maxLength: 2_000,
      description: "Reason that retained history cannot support a valid structured submission.",
    }),
  },
  { additionalProperties: false },
);

const reviewAuditSchema = Type.Object(
  {
    artifactId: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 128,
        description:
          "Local replay id returned by an audited supi_review_run task or /supi-review; omit to list replays.",
      }),
    ),
    offset: pageOffsetSchema,
    limit: pageLimitSchema,
  },
  {
    additionalProperties: false,
    description:
      "Omit artifactId to list local replays. Supply artifactId to read one replay. Offset and limit page either result.",
  },
);

/** Canonical names and provider-facing metadata for every package-owned tool. */
export const REVIEW_TOOL_SPECS = {
  run: {
    name: "supi_review_run",
    label: "Run Review",
    description: `Run one to four independent Inspection-only tasks concurrently against one exact frozen target. Use for code reviews instead of generic subagents. Each change task needs a non-empty change; committed change targets require from; all-state targets omit from. Creates a disposable linked Git worktree. A configured bootstrap can run one shell command there, and enabled auditing stores raw local replays. Output pages are limited to ${MAX_PAGE_CHARACTERS} UTF-16 characters and ${MAX_PAGE_LINES.toLocaleString("en-US")} lines.`,
    promptSnippet: "Run independent inspection-only review tasks",
    promptGuidelines: [
      "Unless explicitly requested otherwise, use `supi_review_run` for reviews instead of `Agent` or generic subagents.",
    ],
    parameters: runReviewSchema,
  },
  output: {
    name: "supi_review_output",
    label: "Read Review Output",
    description: `Read a current-process Review continuation page of at most ${MAX_PAGE_CHARACTERS} UTF-16 characters and ${MAX_PAGE_LINES.toLocaleString("en-US")} lines. Use only with an artifact id from supi_review_run or /supi-review. Artifacts expire after 30 minutes, reload, resume, or a branch change.`,
    promptSnippet: "Continue paged review output",
    promptGuidelines: [],
    parameters: outputPageSchema,
  },
  audit: {
    name: "supi_review_audit",
    label: "Inspect Review Replay",
    description: `List local reviewer replays or read one replay page of at most ${MAX_PAGE_CHARACTERS} UTF-16 characters and ${MAX_PAGE_LINES.toLocaleString("en-US")} lines. Available only when review auditing is enabled; replay content can contain raw repository evidence and tool output.`,
    promptSnippet: "List or inspect local reviewer replays",
    promptGuidelines: ["Do not repeat raw supi_review_audit replay content unless necessary."],
    parameters: reviewAuditSchema,
  },
  submitReview: {
    name: "submit_review",
    label: "Submit Review",
    description:
      "Submit the one final structured result for this review task. A successful call ends the Reviewer Session.",
    parameters: reviewSubmissionSchema,
  },
  declineReviewRecovery: {
    name: "decline_review_recovery",
    label: "Decline Review Recovery",
    description:
      "End Submission Recovery without a Task Verdict when retained history cannot support a valid review submission.",
    parameters: declineReviewRecoverySchema,
  },
  submitPlannerDraft: {
    name: "submit_planner_draft",
    label: "Submit Planner Draft",
    description:
      "Submit the one advisory Planner Draft. A successful call ends the Planner Session.",
    parameters: plannerDraftSchema,
  },
} as const;
