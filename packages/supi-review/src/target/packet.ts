import { createHash } from "node:crypto";
import type {
  EffectiveFindingScope,
  ResolvedReviewTarget,
  ReviewInput,
  ReviewModelSelection,
  ReviewPacket,
  ReviewSnapshot,
  ReviewTask,
} from "../types.ts";
import { buildFileManifest } from "./file-manifest.ts";

/** Protocol version included in every canonical reviewer packet for future evolution. */
export const REVIEW_PACKET_PROTOCOL_VERSION = "6";

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
  if (target.kind === "commit") {
    return [
      "commit",
      `commit=${target.commit}`,
      `parent=${target.parentCommit ?? "empty-tree"}`,
    ].join(" ");
  }
  return ["current-state", `head=${target.headCommit}`].join(" ");
}

function inspectionGuidance(target: ResolvedReviewTarget): string[] {
  const common = [
    "Your cwd is the shared frozen Review Workspace for this batch.",
    "Use the available inspection tools to inspect the repository.",
    "Use Git to inspect the pinned before side; do not infer it from the caller's live worktree.",
  ];
  if (target.kind === "current-state") {
    return [
      "The workspace materializes the complete current filesystem state, including uncommitted and untracked work.",
      "Evaluate that one state against the Review Criteria; there is no before side and no Git-change attribution.",
      "You may inspect unchanged related code as context and report criterion-relevant findings anywhere.",
      "Ignore staged Git state in the workspace; it is a freeze mechanism, not review evidence.",
      common[0],
      common[1],
    ];
  }
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

function reviewScopePaths(snapshot: ReviewSnapshot): string[] | undefined {
  const requested = snapshot.requestedTarget;
  return requested.kind === "current-state" ? requested.paths : undefined;
}

/** Build the canonical caller-policy/engine-mechanics reviewer packet. */
export function buildReviewPacket(
  snapshot: ReviewSnapshot,
  review: ReviewInput,
  task: ReviewTask,
  model: ReviewModelSelection,
): ReviewPacket {
  const currentState = snapshot.target.kind === "current-state";
  const findingScope: EffectiveFindingScope = currentState
    ? "criteria-only"
    : (task.findingScope ?? "change-only");
  const parts = [
    "# Review Task",
    "",
    `Protocol version: ${REVIEW_PACKET_PROTOCOL_VERSION}`,
    `Task id: ${task.id}`,
    `Finding Scope: ${findingScope}`,
    `Target: ${snapshot.title}`,
    `Target identity: ${targetIdentity(snapshot.target)}`,
    ...(currentState ? [] : [`Target diff SHA-256: ${snapshot.diffHash}`]),
    `Reviewer model: ${model.canonicalId}`,
    ...(currentState
      ? []
      : [
          `Changed files: ${snapshot.changes.length}`,
          `Diff stats: +${snapshot.stats.additions} / -${snapshot.stats.deletions}`,
        ]),
  ];
  if (review.sharedContext?.trim()) {
    parts.push("", "## Shared context", review.sharedContext.trim());
  }
  parts.push("", "## Task instructions", task.instructions.trim());
  if (task.criteriaSources?.length) {
    parts.push(
      "",
      "## Review criteria sources",
      "Use these summaries first; each identified source remains authoritative. Retrieve a source read-only only when its summary is insufficient. If required detail is unavailable, preserve concrete findings and mark Criteria Coverage incomplete with the reason.",
      ...task.criteriaSources.map((source) => `- ${source.reference}: ${source.summary}`),
    );
  }
  const scopePaths = reviewScopePaths(snapshot);
  if (scopePaths?.length) {
    parts.push(
      "",
      "## Review scope",
      "Advisory focus paths; they do not restrict inspection or finding eligibility.",
      ...scopePaths.map((path) => `- ${JSON.stringify(path)}`),
    );
  }
  if (!currentState) {
    parts.push("", "## Changed files", ...buildFileManifest(snapshot.changes));
  }
  parts.push("", "## Inspection", ...inspectionGuidance(snapshot.target));
  const prompt = parts.join("\n");
  return { prompt, packetHash: sha256(prompt), taskId: task.id };
}
