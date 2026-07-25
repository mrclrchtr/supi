import type {
  AgentReviewBatchDetails,
  AgentReviewerResult,
  BriefCritique,
  PreparedAgentReviewDetails,
  ReviewResult,
  ReviewSnapshotSummary,
  SynthesizedReviewBrief,
} from "../types.ts";
import { formatReviewContent } from "./format-content.ts";

/** Format a generated brief and the required main-agent quality gate. */
export function formatPreparedAgentReview(details: PreparedAgentReviewDetails): string {
  return [
    "# Review Brief Prepared",
    "",
    `Plan ID: ${details.planId}`,
    `Brief prompt version: ${details.briefPromptVersion}`,
    `Model: ${details.modelId}`,
    `Snapshot: ${details.snapshot.title}`,
    `Snapshot fingerprint: ${details.snapshotFingerprint}`,
    `Files changed: ${details.snapshot.changedFiles.length}`,
    `Diff stats: +${details.snapshot.stats.additions} / -${details.snapshot.stats.deletions}`,
    "",
    "## Generated brief",
    "",
    ...formatBrief(details.generatedBrief),
    "",
    "## Required next step",
    "",
    "Critically compare this brief with the user request, session evidence, and snapshot.",
    "Then call supi_review_run with this planId, an evidence-backed critique, and one to four reviewer assignments.",
    'When the critique verdict is "revise", provide the full corrected revisedBrief.',
    "Do not mutate the review target before running the prepared plan, and call supi_review_run without sibling mutation tools.",
    "",
    "## Changed files",
    "",
    ...details.snapshot.changedFiles.map((file) => `- ${file}`),
  ].join("\n");
}

/** Format a completed review batch for the parent agent. */
export function formatAgentReviewBatch(details: AgentReviewBatchDetails): string {
  const lines = [
    "# Review Batch Complete",
    "",
    `Plan ID: ${details.evaluation.planId}`,
    `Snapshot: ${details.snapshot.title}`,
    `Model: ${details.evaluation.synthesizerModelId}`,
    `Brief critique: ${details.evaluation.critique.verdict.toUpperCase()} — ${details.evaluation.critique.summary}`,
    `Brief critique findings: ${details.evaluation.critique.findings.length}`,
  ];

  for (const { assignment, result } of details.results) {
    lines.push(
      "",
      "---",
      "",
      `## Reviewer: ${assignment.id}`,
      "",
      `Focus: ${assignment.focus}`,
      "",
      formatReviewContent(hydrateResult(result, details.snapshot)),
    );
  }

  lines.push(
    "",
    "---",
    "",
    "## Retained main-agent brief critique",
    "",
    ...formatCritique(details.evaluation.critique),
  );
  if (details.evaluation.critique.verdict === "revise") {
    lines.push(
      "",
      "## Effective revised brief",
      "",
      ...formatBrief(details.evaluation.effectiveBrief),
    );
  }

  return lines.join("\n");
}

/** Format one structured main-agent brief critique. */
export function formatCritique(critique: BriefCritique): string[] {
  const lines = [`Verdict: ${critique.verdict.toUpperCase()}`, `Summary: ${critique.summary}`];
  if (critique.findings.length === 0) {
    lines.push("Findings: none");
    return lines;
  }

  lines.push("Findings:");
  for (const [index, finding] of critique.findings.entries()) {
    lines.push(
      `${index + 1}. [${finding.kind}] ${finding.field}: ${finding.explanation}`,
      `   Evidence: ${finding.evidence}`,
      `   Proposed change: ${finding.proposedChange}`,
    );
  }
  return lines;
}

/** Format all structured fields of a synthesized review brief. */
export function formatBrief(brief: SynthesizedReviewBrief): string[] {
  const lines = [
    `Summary: ${brief.summary}`,
    `Intended outcome: ${brief.intendedOutcome}`,
    ...formatList("Constraints", brief.constraints),
    ...formatList("Focus areas", brief.focusAreas),
    ...formatList("Risky files", brief.riskyFiles),
    ...formatList("Unresolved questions", brief.unresolvedQuestions),
    ...formatList("Review instruction blocks", brief.reviewInstructionBlockIds),
  ];
  if (brief.note) lines.push(`Note: ${brief.note}`);
  return lines;
}

function formatList(label: string, values: readonly string[]): string[] {
  if (values.length === 0) return [`${label}: none`];
  return [`${label}:`, ...values.map((value) => `- ${value}`)];
}

function hydrateResult(result: AgentReviewerResult, summary: ReviewSnapshotSummary): ReviewResult {
  const snapshot = { ...summary, diffText: "" };
  switch (result.kind) {
    case "success":
      return { ...result, snapshot };
    case "failed":
      return { ...result, snapshot };
    case "canceled":
      return { ...result, snapshot };
    case "timeout":
      return { ...result, snapshot };
  }
}
