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
import type { ReviewTargetDiffFile } from "./diff.ts";
import { buildChangeSummary, buildFileManifest } from "./file-manifest.ts";

/** Protocol version included in every canonical reviewer packet for future evolution. */
export const REVIEW_PACKET_PROTOCOL_VERSION = "9";

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

/**
 * Character budget for the changed-path manifest of a Reviewer Packet. Sized so the 200-row
 * bound, not this budget, limits ordinary path lengths: an 8,000-character budget cut a
 * 154-file change at 102 rows and hid the directories the task focused on.
 */
const PACKET_MANIFEST_CHARACTERS = 24_000;

/** Exact command that lists every changed path of the target inside the Review Workspace. */
function inventoryCommand(target: ResolvedReviewTarget): string {
  return target.includeUncommittedChanges
    ? "git diff --name-status HEAD"
    : `git diff --name-status ${target.fromCommit} ${target.toCommit}`;
}

/**
 * Explain a before commit that is not an ancestor of the after state. The target diff is
 * two-dot, so it then also reverses the commits only the before side contains.
 */
function divergenceGuidance(snapshot: ReviewSnapshot): string[] {
  const divergence = snapshot.divergedFrom;
  if (!divergence) return [];
  const { fromCommit, toCommit, includeUncommittedChanges } = snapshot.target;
  if (!divergence.mergeBase) {
    return [
      `Before commit ${fromCommit} has no merge base with the after state, so the target change compares unrelated histories. State this in your summary.`,
    ];
  }
  const ownChanges = includeUncommittedChanges
    ? `git diff ${divergence.mergeBase}`
    : `git diff ${divergence.mergeBase} ${toCommit}`;
  return [
    `Before commit ${fromCommit} is not an ancestor of the after state; their merge base is ${divergence.mergeBase}. The target change therefore also shows commits that only the before side contains, as reversed changes.`,
    `\`${ownChanges}\` shows only the after side's own changes. Attribute a change to the after side only when that diff shows it too, and state this divergence in your summary.`,
  ];
}

/** Point at the saved target diff, or at the Git command when no file was written. */
function completeChangeGuidance(command: string, targetDiff?: ReviewTargetDiffFile): string[] {
  if (!targetDiff) return [`Run \`${command}\` to inspect the complete target change.`];
  return [
    `The complete target change is saved as \`${targetDiff.path}\` (${targetDiff.lineCount} lines), outside the workspace. Page it with \`read\` (offset and limit) or search it with \`grep\`; each Changed files row names the line where that path starts. A binary change takes one line there, so the file's hash can differ from the Target diff SHA-256.`,
    `\`${command} -- <path>\` shows the same change for selected paths.`,
  ];
}

function changeInspectionGuidance(
  target: ResolvedReviewTarget,
  targetDiff?: ReviewTargetDiffFile,
): string[] {
  const from = target.fromCommit;
  if (!from) throw new Error("Change Review Mode requires an exact before commit.");
  if (target.includeUncommittedChanges) {
    return [
      `Before state: exact commit ${from}.`,
      `After state: the frozen current filesystem captured with HEAD ${target.toCommit}.`,
      "The workspace checks out the exact before commit and stages one canonical freeze patch.",
      ...completeChangeGuidance("git diff HEAD", targetDiff),
      `Use \`git show ${from}:path/to/file\` for before-side content.`,
    ];
  }
  return [
    `Before state: exact commit ${from}.`,
    `After state: exact commit ${target.toCommit}.`,
    `The workspace checks out exact after commit ${target.toCommit}.`,
    ...completeChangeGuidance(`git diff ${from} ${target.toCommit}`, targetDiff),
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

/** Facts about the materialized Review Workspace that a Reviewer Packet states. */
export interface ReviewPacketWorkspace {
  /** Saved change file; without it the packet names the Git command only. */
  targetDiff?: ReviewTargetDiffFile;
  /** Whether the configured Dependency Bootstrap ran before fan-out. */
  dependencyBootstrapRan: boolean;
}

function dependencyGuidance(bootstrapRan: boolean): string {
  return bootstrapRan
    ? "The configured Dependency Bootstrap already ran in this workspace; what it installs or generates is present."
    : "No Dependency Bootstrap ran in this workspace: installed dependencies (such as node_modules) and generated files are absent unless you run one.";
}

/**
 * Build the canonical caller-policy and engine-mechanics reviewer packet. Pass `workspace` once
 * the Review Workspace is materialized; without it the packet omits workspace facts.
 */
// biome-ignore lint/complexity/useMaxParams: the batch Review Scope stays separate from the Review Target and input.
export function buildReviewPacket(
  snapshot: ReviewSnapshot,
  review: ReviewInput,
  scope: ReviewScope,
  task: ReviewTask,
  model: ReviewModelSelection,
  workspace?: ReviewPacketWorkspace,
): ReviewPacket {
  const targetDiff = workspace?.targetDiff;
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
      buildChangeSummary(snapshot.changes),
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
      "Each identified source is authoritative; its summary is the caller's extract of the criteria that apply. Cite a criterion from the summary when it is stated there. Retrieve the source read-only for wording, exceptions, or criteria the summary lacks. If required detail is unavailable, preserve concrete findings and mark Criteria Coverage incomplete with the reason.",
      ...task.criteriaSources.map((source) => `- ${source.reference}: ${source.summary}`),
    );
  }
  if (change) {
    parts.push(
      "",
      "## Changed files",
      ...buildFileManifest(snapshot.changes, {
        maxCharacters: PACKET_MANIFEST_CHARACTERS,
        inventoryCommand: inventoryCommand(snapshot.target),
        ...(targetDiff ? { diffStartLines: targetDiff.startLines } : {}),
      }),
    );
  }
  parts.push(
    "",
    "## Inspection",
    "Your cwd is the shared frozen Review Workspace for this batch.",
    "Use the available inspection tools to inspect the repository.",
    ...(workspace ? [dependencyGuidance(workspace.dependencyBootstrapRan)] : []),
    ...(change
      ? [...changeInspectionGuidance(snapshot.target, targetDiff), ...divergenceGuidance(snapshot)]
      : stateInspectionGuidance(snapshot.target)),
  );
  const prompt = parts.join("\n");
  return { prompt, packetHash: sha256(prompt), taskId: task.id };
}
