import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { wrapExtensionContext } from "@mrclrchtr/supi-core/context";
import type { PostReviewPolicy } from "../config.ts";
import type { ReviewBatchDetails, ReviewOutputReference } from "../types.ts";
import { REVIEW_TOOL_SPECS } from "./tool-specs.ts";

function findingCount(details: ReviewBatchDetails): number {
  return details.results.reduce(
    (total, result) => total + (result.status === "completed" ? result.findings.length : 0),
    0,
  );
}

function policyInstructions(policy: PostReviewPolicy): string[] {
  switch (policy) {
    case "ask":
      return [
        "Do not inspect or edit yet. Ask the user what to do, using ask_user when available and a plain question otherwise.",
        "Offer: Verify findings, Verify + fix confirmed findings, Fix all, Fix selected, Report only. If Fix selected is chosen, ask which findings in a follow-up selection.",
      ];
    case "verify":
      return [
        "Independently confirm or refute every finding against the reviewed target. Do not edit yet.",
        "Present the verification, then ask whether to fix all confirmed findings, fix selected confirmed findings, or report only.",
      ];
    case "verify-and-fix":
      return [
        "Independently confirm or refute every finding, then fix every confirmed finding that still applies in the live checkout.",
      ];
    case "fix":
      return ["Fix every reported finding, including non-blocking and low-confidence findings."];
    case "report":
      return [
        "Report the review result and stop. Do not verify findings, edit code, or ask a post-review question.",
      ];
  }
}

/** Build the model-facing containing-Agent protocol for a review that returned findings. */
export function buildPostReviewInstruction(
  policy: PostReviewPolicy,
  details: ReviewBatchDetails,
  output: ReviewOutputReference,
): string | undefined {
  const findings = findingCount(details);
  if (findings === 0) return undefined;

  const lines = [
    `The completed review reported ${findings} finding${findings === 1 ? "" : "s"}. The configured Post-Review Policy is \`${policy}\`.`,
    "A direct user instruction specifically about what to do with this review's findings overrides the configured default. Generic authorization to edit code and your own prior plan do not.",
  ];
  if (output.nextOffset !== undefined) {
    lines.push(
      `Before responding, retrieve every remaining output page with ${REVIEW_TOOL_SPECS.output.name}, starting with ${JSON.stringify({ artifactId: output.artifactId, offset: output.nextOffset })}.`,
    );
  }
  if (details.results.some((result) => result.status !== "completed")) {
    lines.push(
      "Some Review Tasks did not complete. Act on available findings from completed tasks and report the incomplete tasks.",
    );
  }
  lines.push(
    ...policyInstructions(policy),
    "Whenever this flow results in fixes, reconcile duplicate findings and verify incompatible ones. If the live checkout differs from the reviewed after-state, re-verify affected findings against live code and fix those that still apply.",
    "After non-trivial edits, run an existing targeted check when available; report what ran or why it was skipped.",
  );
  return wrapExtensionContext("supi-review", lines.join("\n"), {
    kind: "post-review-policy",
    policy,
  });
}

/** Append the configured protocol to an agent-facing review tool result. */
export function withPostReviewInstruction(
  text: string,
  policy: PostReviewPolicy,
  details: ReviewBatchDetails,
  output: ReviewOutputReference,
): string {
  const instruction = buildPostReviewInstruction(policy, details, output);
  return instruction ? `${text}\n\n${instruction}` : text;
}

/** Queue the post-review Agent turn used by the interactive command surface. */
export function queuePostReviewTurn(
  pi: ExtensionAPI,
  policy: PostReviewPolicy,
  details: ReviewBatchDetails,
  output: ReviewOutputReference,
): void {
  if (policy === "report") return;
  const content = buildPostReviewInstruction(policy, details, output);
  if (!content) return;
  pi.sendMessage(
    {
      customType: "supi-review-followup",
      content,
      display: false,
      details: { policy, output },
    },
    { deliverAs: "followUp", triggerTurn: true },
  );
}
