import {
  runGit as git,
  runGitAllowExit as gitAllowExit,
  runGitBuffer as gitBuffer,
  resolveGitRepositoryRoot,
  withReviewIndex,
} from "../git-command.ts";
import type { ReviewSnapshot, ReviewSnapshotSummary, ReviewTargetSpec } from "../types.ts";
import {
  buildReviewChanges,
  createDiffAccumulator,
  untrackedPatchChange,
} from "./change-metadata.ts";
import { DIFF_FLAGS, diffUntrackedFile, parseNullList } from "./diff.ts";

function normalizedEndpoint(value: string | undefined, name: "from" | "to"): string | undefined {
  if (value === undefined) return undefined;
  const endpoint = value.trim();
  if (!endpoint) throw new Error(`Review Target ${name} must not be blank.`);
  if (endpoint.includes("..") || /\^[@!]|\^-/.test(endpoint)) {
    throw new Error(`Review Target ${name} must name one commit, not a commit range.`);
  }
  return endpoint;
}

async function describeInvalidEndpoint(
  cwd: string,
  endpoint: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const object = (
    await gitAllowExit(cwd, ["rev-parse", "--verify", "--end-of-options", endpoint], [1, 128], {
      signal,
    })
  ).trim();
  if (!object) return undefined;
  const type = (await gitAllowExit(cwd, ["cat-file", "-t", object], [128], { signal })).trim();
  return type || undefined;
}

/** Resolve one endpoint syntax string to one exact full commit id. */
async function resolveEndpoint(
  cwd: string,
  endpoint: string | undefined,
  name: "from" | "to",
  signal?: AbortSignal,
): Promise<string | undefined> {
  if (endpoint === undefined) return undefined;
  const commit = (
    await gitAllowExit(
      cwd,
      ["rev-parse", "--verify", "--end-of-options", `${endpoint}^{commit}`],
      [1, 128],
      { signal },
    )
  ).trim();
  if (commit) return commit.toLowerCase();

  const type = await describeInvalidEndpoint(cwd, endpoint, signal);
  if (type === "tree" || type === "blob") {
    throw new Error(`Review Target ${name} must resolve to a commit, not a ${type}.`);
  }
  throw new Error(`Review Target ${name} does not resolve to one commit in this repository.`);
}

async function capturedHead(cwd: string, signal?: AbortSignal): Promise<string> {
  const head = (
    await gitAllowExit(
      cwd,
      [
        "rev-parse",
        "--verify",
        // biome-ignore lint/security/noSecrets: Git revision syntax, not a secret
        "HEAD^{commit}",
      ],
      [1, 128],
      { signal },
    )
  ).trim();
  if (!head) throw new Error("No HEAD commit found in this repository.");
  return head.toLowerCase();
}

/** True when this exact commit has no parent. A shallow boundary is not a root. */
export async function isRootCommit(
  cwd: string,
  commit: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const body = await git(cwd, ["cat-file", "-p", commit], undefined, signal);
  const headerEnd = body.indexOf("\n\n");
  const header = headerEnd < 0 ? body : body.slice(0, headerEnd);
  return !/^parent [0-9a-f]+$/m.test(header);
}

async function filesystemSnapshot(
  repositoryRoot: string,
  target: ReviewSnapshot["target"],
  signal?: AbortSignal,
): Promise<Pick<ReviewSnapshot, "changes" | "diffHash" | "stats">> {
  const baseline = target.fromCommit ?? target.toCommit;
  return withReviewIndex(repositoryRoot, target.toCommit, baseline, {
    signal,
    operation: async (indexFile) => {
      const [nameStatus, numstat, trackedDiff, untrackedText] = await Promise.all([
        git(
          repositoryRoot,
          ["diff", ...DIFF_FLAGS, "--name-status", "-z", baseline],
          indexFile,
          signal,
        ),
        git(
          repositoryRoot,
          ["diff", ...DIFF_FLAGS, "--numstat", "-z", baseline],
          indexFile,
          signal,
        ),
        gitBuffer(repositoryRoot, ["diff", ...DIFF_FLAGS, baseline], indexFile, signal),
        git(
          repositoryRoot,
          ["ls-files", "--others", "--exclude-standard", "-z"],
          indexFile,
          signal,
        ),
      ]);
      const changes = buildReviewChanges(nameStatus, numstat);
      const diff = createDiffAccumulator();
      diff.append(trackedDiff);
      for (const path of parseNullList(untrackedText)) {
        signal?.throwIfAborted();
        const patch = await diffUntrackedFile(repositoryRoot, path);
        diff.append(patch);
        changes.push(untrackedPatchChange(path, patch));
      }
      changes.sort((left, right) => left.path.localeCompare(right.path));
      return { changes, ...diff.finish(changes.length) };
    },
  });
}

async function committedSnapshot(
  repositoryRoot: string,
  target: ReviewSnapshot["target"],
  signal?: AbortSignal,
): Promise<Pick<ReviewSnapshot, "changes" | "diffHash" | "stats">> {
  if (!target.fromCommit) {
    return { changes: [], ...createDiffAccumulator().finish(0) };
  }
  const [diffText, nameStatus, numstat] = await Promise.all([
    gitBuffer(
      repositoryRoot,
      ["diff", ...DIFF_FLAGS, target.fromCommit, target.toCommit],
      undefined,
      signal,
    ),
    git(
      repositoryRoot,
      ["diff", ...DIFF_FLAGS, "--name-status", "-z", target.fromCommit, target.toCommit],
      undefined,
      signal,
    ),
    git(
      repositoryRoot,
      ["diff", ...DIFF_FLAGS, "--numstat", "-z", target.fromCommit, target.toCommit],
      undefined,
      signal,
    ),
  ]);
  const changes = buildReviewChanges(nameStatus, numstat);
  const diff = createDiffAccumulator();
  diff.append(diffText);
  return { changes, ...diff.finish(changes.length) };
}

function titleFor(target: ReviewSnapshot["target"]): string {
  if (target.includeUncommittedChanges) {
    return target.fromCommit
      ? `Filesystem changes ${target.fromCommit.slice(0, 7)}..filesystem`
      : "Current filesystem";
  }
  return target.fromCommit
    ? `Changes ${target.fromCommit.slice(0, 7)}..${target.toCommit.slice(0, 7)}`
    : `State ${target.toCommit.slice(0, 7)}`;
}

/**
 * Pin a Review Target to exact commits and capture its canonical patch metadata.
 * This public resolver does not compute a merge base.
 */
export async function resolveReviewSnapshot(
  cwd: string,
  requested: ReviewTargetSpec = {},
  signal?: AbortSignal,
): Promise<ReviewSnapshot> {
  const repositoryRoot = await resolveGitRepositoryRoot(cwd, signal);
  const from = normalizedEndpoint(requested.from, "from");
  const to = normalizedEndpoint(requested.to, "to");
  const includeUncommittedChanges = requested.includeUncommittedChanges ?? true;
  if (includeUncommittedChanges && to !== undefined) {
    throw new Error("Review Target to is not valid when includeUncommittedChanges is true.");
  }

  const head = await capturedHead(repositoryRoot, signal);
  const [fromCommit, explicitToCommit] = await Promise.all([
    resolveEndpoint(repositoryRoot, from, "from", signal),
    resolveEndpoint(repositoryRoot, to, "to", signal),
  ]);
  const toCommit = includeUncommittedChanges ? head : (explicitToCommit ?? head);
  const target = {
    ...(includeUncommittedChanges
      ? { fromCommit: fromCommit ?? head }
      : fromCommit
        ? { fromCommit }
        : {}),
    toCommit,
    includeUncommittedChanges,
  };
  const requestedTarget = {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    includeUncommittedChanges,
  };
  const metadata = includeUncommittedChanges
    ? await filesystemSnapshot(repositoryRoot, target, signal)
    : await committedSnapshot(repositoryRoot, target, signal);
  return {
    repositoryRoot,
    requestedTarget,
    target,
    title: titleFor(target),
    ...metadata,
  };
}

/** Return the public, patch-free snapshot summary. */
export function summarizeReviewSnapshot(snapshot: ReviewSnapshot): ReviewSnapshotSummary {
  const { repositoryRoot: _, ...summary } = snapshot;
  return { ...summary, changes: snapshot.changes.map((change) => ({ ...change })) };
}
