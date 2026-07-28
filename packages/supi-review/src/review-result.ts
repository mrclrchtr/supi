import { REVIEW_LIMITS } from "./review-limits.ts";
import { normalizeRepositoryRelativePath } from "./review-path.ts";
import type { NormalizedReviewSubmission, ReviewSubmission } from "./types.ts";

function requireText(value: string, label: string, maxCharacters: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be blank.`);
  if (normalized.length > maxCharacters) {
    throw new Error(
      `${label} must not exceed ${maxCharacters.toLocaleString("en-US")} characters.`,
    );
  }
  return normalized;
}

/** Derive the machine verdict while preserving reviewer-authored finding order. */
export function normalizeReviewSubmission(
  submission: ReviewSubmission,
): NormalizedReviewSubmission {
  if (submission.findings.length > REVIEW_LIMITS.findingsPerTask) {
    throw new Error(`A review task may submit at most ${REVIEW_LIMITS.findingsPerTask} findings.`);
  }
  return {
    summary: requireText(submission.summary, "Review summary", REVIEW_LIMITS.summaryCharacters),
    findings: submission.findings.map((finding, index) => {
      if (
        !Number.isFinite(finding.confidence) ||
        finding.confidence < 0 ||
        finding.confidence > 1
      ) {
        throw new Error(`Finding ${index + 1} confidence must be between 0 and 1.`);
      }
      if (
        finding.location &&
        (!Number.isSafeInteger(finding.location.startLine) ||
          !Number.isSafeInteger(finding.location.endLine) ||
          finding.location.startLine < 1 ||
          finding.location.endLine < finding.location.startLine)
      ) {
        throw new Error(`Finding ${index + 1} location must contain a valid ordered line range.`);
      }
      return {
        ...finding,
        title: requireText(
          finding.title,
          `Finding ${index + 1} title`,
          REVIEW_LIMITS.findingTitleCharacters,
        ),
        description: requireText(
          finding.description,
          `Finding ${index + 1} description`,
          REVIEW_LIMITS.findingDescriptionCharacters,
        ),
        location: finding.location
          ? {
              ...finding.location,
              path: normalizeRepositoryRelativePath(
                requireText(
                  finding.location.path,
                  `Finding ${index + 1} location path`,
                  REVIEW_LIMITS.locationPathCharacters,
                ),
              ),
            }
          : undefined,
      };
    }),
    verdict: submission.findings.some((finding) => finding.blocksAcceptance) ? "issues" : "pass",
  };
}
