import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { listLocalBranches, listRecentCommits } from "../git-choices.ts";
import { runGit, runGitAllowExit } from "../git-command.ts";
import type { ReviewTargetSpec } from "../types.ts";

type CommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];

/** Exact targets retained while task modes are edited. */
export interface InteractiveTarget {
  selectedTarget: ReviewTargetSpec;
  stateTarget: ReviewTargetSpec;
  changeTarget?: ReviewTargetSpec;
}

/** Select the current HEAD as an exact endpoint for interactive Review Targets. */
async function selectedHead(cwd: string): Promise<string> {
  const head = (
    await runGitAllowExit(
      cwd,
      [
        "rev-parse",
        "--verify",
        // biome-ignore lint/security/noSecrets: Git revision syntax, not a secret.
        "HEAD^{commit}",
      ],
      [1, 128],
    )
  ).trim();
  if (!head) throw new Error("No HEAD commit found in this repository.");
  return head;
}

/** Read the first parent from the raw commit header and require its object. */
async function firstAvailableParent(cwd: string, commit: string): Promise<string | undefined> {
  const body = await runGit(cwd, ["cat-file", "-p", commit]);
  const headerEnd = body.indexOf("\n\n");
  const header = headerEnd < 0 ? body : body.slice(0, headerEnd);
  const parent = /^parent ([0-9a-f]+)$/m.exec(header)?.[1];
  if (!parent) return undefined;
  const type = (await runGitAllowExit(cwd, ["cat-file", "-t", parent], [1, 128])).trim();
  if (type !== "commit") {
    throw new Error(
      "The selected commit's first parent is unavailable. Fetch it before a one-commit Review.",
    );
  }
  return parent;
}

/** Select one target and resolve merge bases only for the two base-branch choices. */
export async function selectInteractiveTarget(
  ctx: CommandContext,
): Promise<InteractiveTarget | undefined> {
  const kind = await ctx.ui.select("Review target", [
    "Current work",
    "Current work against a base branch",
    "Committed work against a base branch",
    "One commit",
  ]);
  if (!kind) return undefined;
  const head = await selectedHead(ctx.cwd);
  if (kind === "Current work") {
    return {
      selectedTarget: { from: head, includeUncommittedChanges: true },
      stateTarget: { includeUncommittedChanges: true },
      changeTarget: { from: head, includeUncommittedChanges: true },
    };
  }

  const choices =
    kind === "One commit" ? await listRecentCommits(ctx.cwd) : await listLocalBranches(ctx.cwd);
  const label = await ctx.ui.select(
    kind === "One commit" ? "Commit" : "Base branch",
    choices.map((choice) => choice.label),
  );
  const choice = choices.find((candidate) => candidate.label === label);
  if (!choice) return undefined;

  if (kind === "One commit") {
    const parent = await firstAvailableParent(ctx.cwd, choice.commit);
    const stateTarget = { to: choice.commit, includeUncommittedChanges: false };
    return parent
      ? {
          selectedTarget: { from: parent, ...stateTarget },
          stateTarget,
          changeTarget: { from: parent, ...stateTarget },
        }
      : { selectedTarget: stateTarget, stateTarget };
  }

  const from = (await runGitAllowExit(ctx.cwd, ["merge-base", choice.commit, head], [1])).trim();
  if (!from) throw new Error("The selected branch has no common ancestor with HEAD.");
  if (kind === "Current work against a base branch") {
    return {
      selectedTarget: { from, includeUncommittedChanges: true },
      stateTarget: { includeUncommittedChanges: true },
      changeTarget: { from, includeUncommittedChanges: true },
    };
  }

  const changeTarget = { from, to: head, includeUncommittedChanges: false };
  return {
    selectedTarget: changeTarget,
    stateTarget: { to: head, includeUncommittedChanges: false },
    changeTarget,
  };
}
