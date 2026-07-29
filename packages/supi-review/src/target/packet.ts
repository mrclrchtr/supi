import { createHash } from "node:crypto";
import type {
  ResolvedReviewTarget,
  ReviewInput,
  ReviewModelSelection,
  ReviewPacket,
  ReviewSnapshot,
  ReviewTask,
} from "../types.ts";
import { buildFileManifest } from "./file-manifest.ts";

/** Protocol version included in every canonical reviewer packet for future evolution. */
export const REVIEW_PACKET_PROTOCOL_VERSION = "4";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function targetIdentity(target: ResolvedReviewTarget): string {
  if (target.kind === "working-tree") {
    return [
      "working-tree",
      `head=${target.headCommit}`,
      ...(target.requestedBaseCommit ? [`requested-base=${target.requestedBaseCommit}`] : []),
      ...(target.mergeBaseCommit ? [`merge-base=${target.mergeBaseCommit}`] : []),
    ].join(" ");
  }
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

function inspectionGuidance(target: ResolvedReviewTarget): string[] {
  const common = [
    "Your cwd is the shared frozen Review Workspace for this batch.",
    "Use Pi read and ordinary Git/bash inspection. The available Code Intelligence tools are code_resolve, code_inspect, code_orientation, code_graph, code_find, and code_health.",
    "Use Git to inspect the pinned before side; do not infer it from the caller's live worktree.",
    "If missing local dependencies limit Code Intelligence, you may choose a Dependency Bootstrap command in this disposable workspace.",
    "Do not run tests, builds, linters, services, nested Pi sessions, nested reviews, or intentional source/Git-history mutation.",
  ];
  if (target.kind === "working-tree") {
    const baseline = target.mergeBaseCommit ?? target.headCommit;
    return [
      "The workspace checks out the pinned baseline with the canonical target patch staged.",
      "Run `git diff HEAD` to inspect the complete target patch.",
      `Use \`git show ${baseline}:path/to/file\` for before-side content.`,
      ...common,
    ];
  }
  if (target.kind === "comparison") {
    return [
      `The workspace checks out pinned after commit ${target.headCommit}.`,
      `Run \`git diff ${target.mergeBaseCommit} ${target.headCommit}\` to inspect the target patch.`,
      `Use \`git show ${target.mergeBaseCommit}:path/to/file\` for before-side content.`,
      ...common,
    ];
  }
  return [
    `The workspace checks out pinned commit ${target.commit}.`,
    target.parentCommit
      ? `Run \`git diff ${target.parentCommit} ${target.commit}\` to inspect the target patch.`
      : "This is a root commit; use `git show --format= --root HEAD` to inspect the target patch.",
    target.parentCommit
      ? `Use \`git show ${target.parentCommit}:path/to/file\` for before-side content.`
      : "The before side is the empty tree.",
    ...common,
  ];
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
    `Target diff SHA-256: ${snapshot.diffHash}`,
    `Reviewer model: ${model.canonicalId}`,
    `Changed files: ${snapshot.changes.length}`,
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
    ...buildFileManifest(snapshot.changes),
    "",
    "## Inspection",
    ...inspectionGuidance(snapshot.target),
    "",
    "## Delivery",
    "Call submit_review exactly once with the task summary and findings.",
  );
  const prompt = parts.join("\n");
  return { prompt, packetHash: sha256(prompt), taskId: task.id };
}
