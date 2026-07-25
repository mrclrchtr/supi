export const PREPARE_REVIEW_TOOL_NAME = "supi_review_prepare";
export const RUN_REVIEW_TOOL_NAME = "supi_review_run";

export const prepareReviewToolDescription =
  "Prepare a session-aware review brief for a freshness-checked git target and return a session-scoped planId. " +
  "After this tool returns, critically compare the generated brief with the user request, session evidence, and snapshot before calling supi_review_run. Does not run reviewers.";

export const prepareReviewPromptSnippet =
  "Prepare a session-aware review plan for main-agent critique before independent reviewers run";

export const prepareReviewPromptGuidelines = [
  "Use supi_review_prepare when an independent review is useful; do not combine it in the same tool batch with edit, write, or mutating bash calls.",
  "After supi_review_prepare, assess the generated brief for omissions, unsupported inferences, misplaced priorities, and unclear wording, then call supi_review_run with an evidence-backed critique.",
  "Do not mutate the review target between supi_review_prepare and supi_review_run, and call supi_review_run without sibling mutation tools; stale or mid-review changes are rejected.",
];

export const runReviewToolDescription =
  "Run one to four independent read-only reviewer child sessions from a prepared plan. " +
  "Requires the planId from supi_review_prepare and a structured main-agent critique. " +
  'When critique.verdict is "revise", revisedBrief must contain the full corrected brief. ' +
  "The prepared snapshot is freshness-checked and the plan is consumed once execution begins.";
