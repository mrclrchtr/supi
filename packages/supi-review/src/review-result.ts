import { REVIEW_LIMITS } from "./review-limits.ts";
import { normalizeRepositoryRelativePath, normalizeReviewPathArgument } from "./review-path.ts";
import type {
  CriteriaCoverage,
  FindingCounts,
  NormalizedReviewSubmission,
  ReviewFinding,
  ReviewLocation,
  ReviewSubmission,
} from "./types.ts";

type ReviewSubmissionInput = Omit<ReviewSubmission, "findings"> & {
  findings: Array<
    Omit<ReviewFinding, "location"> & {
      location?: Omit<ReviewLocation, "endLine"> & { endLine?: number };
    }
  >;
};

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

function countFindings(
  findings: Array<Pick<ReviewFinding, "blocksAcceptance" | "impact">>,
): FindingCounts {
  const counts: FindingCounts = {
    total: findings.length,
    blocking: 0,
    nonBlocking: 0,
    byImpact: { low: 0, medium: 0, high: 0 },
  };
  for (const finding of findings) {
    if (finding.blocksAcceptance) counts.blocking++;
    else counts.nonBlocking++;
    counts.byImpact[finding.impact]++;
  }
  return counts;
}

function normalizeCriteriaCoverage(coverage: CriteriaCoverage): CriteriaCoverage {
  if (!coverage) throw new Error("Review submissions must include criteria coverage.");
  const reason = ("reason" in coverage ? coverage.reason : undefined)?.trim();
  if (coverage.status === "complete") {
    if (reason) throw new Error("Complete criteria coverage must not include a reason.");
    return { status: "complete" };
  }
  if (!reason) throw new Error("Incomplete criteria coverage needs a criteria coverage reason.");
  if (reason.length > REVIEW_LIMITS.criteriaCoverageReasonCharacters) {
    throw new Error(
      `Criteria coverage reason must not exceed ${REVIEW_LIMITS.criteriaCoverageReasonCharacters} characters.`,
    );
  }
  return { status: "incomplete", reason };
}

/** Derive an acceptance verdict and structured finding counts without reordering findings. */
export function normalizeReviewSubmission(
  submission: ReviewSubmissionInput,
): NormalizedReviewSubmission {
  if (submission.findings.length > REVIEW_LIMITS.findingsPerTask) {
    throw new Error(`A review task may submit at most ${REVIEW_LIMITS.findingsPerTask} findings.`);
  }
  const findingCounts = countFindings(submission.findings);
  const criteriaCoverage = normalizeCriteriaCoverage(submission.criteriaCoverage);
  return {
    summary: requireText(submission.summary, "Review summary", REVIEW_LIMITS.summaryCharacters),
    criteriaCoverage,
    findings: submission.findings.map((finding, index) => {
      if (
        !Number.isFinite(finding.confidence) ||
        finding.confidence < 0 ||
        finding.confidence > 1
      ) {
        throw new Error(`Finding ${index + 1} confidence must be between 0 and 1.`);
      }
      if (finding.location) {
        const endLine = finding.location.endLine ?? finding.location.startLine;
        if (
          !Number.isSafeInteger(finding.location.startLine) ||
          !Number.isSafeInteger(endLine) ||
          finding.location.startLine < 1 ||
          endLine < finding.location.startLine
        ) {
          throw new Error(`Finding ${index + 1} location must contain a valid ordered line range.`);
        }
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
              endLine: finding.location.endLine ?? finding.location.startLine,
              path: normalizeRepositoryRelativePath(
                normalizeReviewPathArgument(
                  requireText(
                    finding.location.path,
                    `Finding ${index + 1} location path`,
                    REVIEW_LIMITS.locationPathCharacters,
                  ),
                ),
              ),
            }
          : undefined,
      };
    }),
    findingCounts,
    verdict:
      findingCounts.blocking > 0
        ? "issues"
        : criteriaCoverage?.status === "incomplete"
          ? "incomplete"
          : findingCounts.total > 0
            ? "pass_with_findings"
            : "pass",
  };
}
