import { createHash } from "node:crypto";
import type {
  ResolvedReviewTarget,
  ReviewInput,
  ReviewModelSelection,
  ReviewPacket,
  ReviewSnapshot,
  ReviewTask,
} from "../types.ts";

/** Protocol version included in every canonical reviewer packet for future evolution. */
export const REVIEW_PACKET_PROTOCOL_VERSION = "1";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function targetIdentity(target: ResolvedReviewTarget): string {
  if (target.kind === "working-tree") return `working-tree head=${target.headCommit}`;
  if (target.kind === "comparison") {
    return [
      "comparison",
      `requested-base=${target.requestedBaseCommit}`,
      `merge-base=${target.mergeBaseCommit}`,
      `head=${target.headCommit}`,
    ].join(" ");
  }
  return [
    "commit",
    `commit=${target.commit}`,
    `parent=${target.parentCommit ?? "empty-tree"}`,
  ].join(" ");
}

/** Build the canonical caller-policy/engine-mechanics reviewer packet. */
export function buildReviewPacket(
  snapshot: ReviewSnapshot,
  review: ReviewInput,
  task: ReviewTask,
  model: ReviewModelSelection,
): ReviewPacket {
  const parts = [
    "# Review Task",
    "",
    `Protocol version: ${REVIEW_PACKET_PROTOCOL_VERSION}`,
    `Task id: ${task.id}`,
    `Target: ${snapshot.title}`,
    `Target identity: ${targetIdentity(snapshot.target)}`,
    `Target diff SHA-256: ${sha256(snapshot.diffText)}`,
    `Reviewer model: ${model.canonicalId}`,
    `Changed files: ${snapshot.changedFiles.length}`,
    `Diff stats: +${snapshot.stats.additions} / -${snapshot.stats.deletions}`,
  ];
  if (review.sharedContext?.trim()) {
    parts.push("", "## Shared context", review.sharedContext.trim());
  }
  parts.push(
    "",
    "## Task instructions",
    task.instructions.trim(),
    "",
    "## Changed files",
    ...snapshot.changedFiles.map((file) => `- ${JSON.stringify(file)}`),
    "",
    "## Inspection",
    "Use list_review_files, read_review_diff, read_review_file, and search_review_files.",
    "All tools resolve against the selected review target.",
    "",
    "## Delivery",
    "Call submit_review exactly once with the task summary and findings.",
  );
  const prompt = parts.join("\n");
  return { prompt, packetHash: sha256(prompt), taskId: task.id };
}
