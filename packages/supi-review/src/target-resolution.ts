import {
  getCommitFileNames,
  getCommitShow,
  getDiff,
  getDiffFileNames,
  getMergeBase,
  getUncommittedDiff,
  getUncommittedFileNames,
} from "./git.ts";
import type { ReviewResult, ReviewTarget } from "./types.ts";

interface TargetResolutionContext {
  cwd: string;
}

type TargetResolutionSuccess = {
  kind: "success";
  target: ReviewTarget;
};

export async function resolveGitTarget(
  target: ReviewTarget,
  ctx: TargetResolutionContext,
): Promise<TargetResolutionSuccess | ReviewResult> {
  switch (target.type) {
    case "base-branch":
      return resolveBaseBranchTarget(target, ctx);
    case "uncommitted":
      return resolveUncommittedTarget(target, ctx);
    case "commit":
      return resolveCommitTarget(target, ctx);
    case "custom":
      return { kind: "success", target };
  }
}

async function resolveBaseBranchTarget(
  target: Extract<ReviewTarget, { type: "base-branch" }>,
  ctx: TargetResolutionContext,
): Promise<TargetResolutionSuccess | ReviewResult> {
  if (target.diff) {
    return { kind: "success", target };
  }

  const baseSha = await getMergeBase(ctx.cwd, target.branch);
  if (!baseSha) {
    return { kind: "failed", reason: `No merge base found for ${target.branch}`, target };
  }

  const [diff, changedFiles] = await Promise.all([
    getDiff(ctx.cwd, baseSha),
    resolveChangedFiles(target.changedFiles, () => getDiffFileNames(ctx.cwd, baseSha)),
  ]);

  return { kind: "success", target: { ...target, diff, changedFiles } };
}

async function resolveUncommittedTarget(
  target: Extract<ReviewTarget, { type: "uncommitted" }>,
  ctx: TargetResolutionContext,
): Promise<TargetResolutionSuccess | ReviewResult> {
  if (target.diff) {
    return { kind: "success", target };
  }

  const [diff, changedFiles] = await Promise.all([
    getUncommittedDiff(ctx.cwd),
    resolveChangedFiles(target.changedFiles, () => getUncommittedFileNames(ctx.cwd)),
  ]);

  if (!diff) {
    return { kind: "failed", reason: "No uncommitted changes", target };
  }

  return { kind: "success", target: { ...target, diff, changedFiles } };
}

async function resolveCommitTarget(
  target: Extract<ReviewTarget, { type: "commit" }>,
  ctx: TargetResolutionContext,
): Promise<TargetResolutionSuccess | ReviewResult> {
  if (target.show) {
    return { kind: "success", target };
  }

  const [show, changedFiles] = await Promise.all([
    getCommitShow(ctx.cwd, target.sha),
    resolveChangedFiles(target.changedFiles, () => getCommitFileNames(ctx.cwd, target.sha)),
  ]);

  return {
    kind: "success",
    target: { ...target, show, changedFiles },
  };
}

function resolveChangedFiles(
  changedFiles: string[] | undefined,
  load: () => Promise<string[]>,
): Promise<string[]> {
  return changedFiles ? Promise.resolve(changedFiles) : load();
}
