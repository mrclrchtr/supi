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
    view: Type.Optional(
      Type.Union([Type.Literal("outline"), Type.Literal("message"), Type.Literal("raw")], {
        description:
          "Artifact view. Omit for Replay Outline; message needs messageIndex; raw returns exact persisted JSON.",
      }),
    ),
    messageIndex: Type.Optional(
      Type.Integer({
        minimum: 0,
        description: "Zero-based persisted message array position; valid only with view: message.",
      }),
    ),
    offset: pageOffsetSchema,
    limit: pageLimitSchema,
  },
  {
    additionalProperties: false,
    description:
      "Omit artifactId to list replays. Artifact access defaults to bounded Replay Outline; select one message or explicit raw JSON when needed.",
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
      "Use `supi_review_run` for repository reviews and criteria-based inspections. Use task mode `change` for before-and-after changes and `state` for the frozen current code state.",
      "Do not use `supi_review_run` for exploration.",
      "Do not use `supi_review_run` for simple reviews you can complete directly.",
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
    description: `List local reviewer replays or inspect one through bounded Replay Outline, selected-message, or raw views. Outline is metadata-only. Message and raw views can contain repository evidence and tool output. Pages are at most ${MAX_PAGE_CHARACTERS} UTF-16 characters and ${MAX_PAGE_LINES.toLocaleString("en-US")} lines. Available only when review auditing is enabled.`,
    promptSnippet: "List or navigate local reviewer replays",
    promptGuidelines: [
      "Use supi_review_audit Replay Outline before selected-message or raw replay access.",
      "Do not repeat raw supi_review_audit replay content unless necessary.",
    ],
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
