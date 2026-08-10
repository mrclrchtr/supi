import { createHash } from "node:crypto";
import type {
  ResolvedReviewTarget,
  ReviewInput,
  ReviewModelSelection,
  ReviewPacket,
  ReviewScope,
  ReviewSnapshot,
  ReviewTask,
} from "../types.ts";
import { buildFileManifest } from "./file-manifest.ts";

/** Protocol version included in every canonical reviewer packet for future evolution. */
export const REVIEW_PACKET_PROTOCOL_VERSION = "7";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function targetIdentity(target: ResolvedReviewTarget, mode: ReviewTask["mode"]): string {
  return [
    ...(mode === "change" ? [`from=${target.fromCommit ?? "none"}`] : []),
    `to=${target.toCommit}`,
    `include-uncommitted=${target.includeUncommittedChanges}`,
  ].join(" ");
}

function targetLabel(snapshot: ReviewSnapshot, mode: ReviewTask["mode"]): string {
  if (mode === "change") return snapshot.title;
  return snapshot.target.includeUncommittedChanges
    ? `Frozen current filesystem after HEAD ${snapshot.target.toCommit}`
    : `Frozen after state at commit ${snapshot.target.toCommit}`;
}

function changeInspectionGuidance(target: ResolvedReviewTarget): string[] {
  const from = target.fromCommit;
  if (!from) throw new Error("Change Review Mode requires an exact before commit.");
  if (target.includeUncommittedChanges) {
    return [
      `Before state: exact commit ${from}.`,
      `After state: the frozen current filesystem captured with HEAD ${target.toCommit}.`,
      "The workspace checks out the exact before commit and stages one canonical freeze patch.",
      "Run `git diff HEAD` to inspect the complete target change.",
      `Use \`git show ${from}:path/to/file\` for before-side content.`,
    ];
  }
  return [
    `Before state: exact commit ${from}.`,
    `After state: exact commit ${target.toCommit}.`,
    `The workspace checks out exact after commit ${target.toCommit}.`,
    `Run \`git diff ${from} ${target.toCommit}\` to inspect the complete target change.`,
    `Use \`git show ${from}:path/to/file\` for before-side content.`,
  ];
}

function reviewScopeGuidance(scope: ReviewScope): string[] | undefined {
  const paths = scope.paths;
  if (!paths?.length) return undefined;
  return [
    "## Review Scope",
    "Focus first on these repository-relative paths:",
    ...paths.map((path) => `- ${JSON.stringify(path)}`),
    "This scope focuses review. It does not restrict repository inspection, changed-path evidence, or finding eligibility.",
  ];
}

function stateInspectionGuidance(target: ResolvedReviewTarget): string[] {
  const after = target.includeUncommittedChanges
    ? `the frozen current filesystem captured with HEAD ${target.toCommit}`
    : `exact commit ${target.toCommit}`;
  return [
    `After state: ${after}.`,
    "Evaluate only this after state against the Review Criteria. Do not use before-side attribution.",
    target.includeUncommittedChanges
      ? "The workspace stages a canonical freeze patch. Its staged changes are freeze mechanics, not Target Evidence."
      : "The workspace is a clean checkout of the exact after commit.",
  ];
}

/** Build the canonical caller-policy and engine-mechanics reviewer packet. */
// biome-ignore lint/complexity/useMaxParams: the batch Review Scope stays separate from the Review Target and input.
export function buildReviewPacket(
  snapshot: ReviewSnapshot,
  review: ReviewInput,
  scope: ReviewScope,
  task: ReviewTask,
  model: ReviewModelSelection,
): ReviewPacket {
  const change = task.mode === "change";
  const parts = [
    "# Review Task",
    "",
    `Protocol version: ${REVIEW_PACKET_PROTOCOL_VERSION}`,
    `Task id: ${task.id}`,
    `Review Mode: ${task.mode}`,
    `Target: ${targetLabel(snapshot, task.mode)}`,
    `Target identity: ${targetIdentity(snapshot.target, task.mode)}`,
    `Reviewer model: ${model.canonicalId}`,
  ];
  if (change) {
    parts.push(
      `Target diff SHA-256: ${snapshot.diffHash}`,
      `Changed files: ${snapshot.changes.length}`,
      `Diff stats: +${snapshot.stats.additions} / -${snapshot.stats.deletions}`,
    );
  }
  if (review.sharedContext?.trim()) {
    parts.push("", "## Shared context", review.sharedContext.trim());
  }
  const scopeGuidance = reviewScopeGuidance(scope);
  if (scopeGuidance) parts.push("", ...scopeGuidance);
  parts.push("", "## Task instructions", task.instructions.trim());
  if (task.criteriaSources?.length) {
    parts.push(
      "",
      "## Review criteria sources",
      "Use these summaries first. Each identified source is authoritative. Retrieve a source read-only only when its summary is not sufficient. If required detail is unavailable, preserve concrete findings and mark Criteria Coverage incomplete with the reason.",
      ...task.criteriaSources.map((source) => `- ${source.reference}: ${source.summary}`),
    );
  }
  if (change) parts.push("", "## Changed files", ...buildFileManifest(snapshot.changes));
  parts.push(
    "",
    "## Inspection",
    "Your cwd is the shared frozen Review Workspace for this batch.",
    "Use the available inspection tools to inspect the repository.",
    ...(change
      ? changeInspectionGuidance(snapshot.target)
      : stateInspectionGuidance(snapshot.target)),
  );
  const prompt = parts.join("\n");
  return { prompt, packetHash: sha256(prompt), taskId: task.id };
}
