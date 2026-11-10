import { execFileSync } from "node:child_process";

/** Disclosed in evidence limitations whenever --since-commit is used. */
export const SINCE_COMMIT_LIMITATION =
  "--since-commit compares commit times; sessions without runtime provenance (Debug capture off, or older than provenance recording) are excluded and counted as unknownProvenance. Dirty sessions ran uncommitted changes.";

/** Resolve a revision to its commit and committer time in the current repository. */
export function resolveCommit(rev) {
  if (!rev) return null;
  try {
    const [commit, commitTime] = execFileSync(
      "git",
      ["log", "-1", "--format=%H%n%cI", `${rev}^{commit}`, "--"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
      .trim()
      .split("\n");
    return { rev, commit, commitTime };
  } catch (error) {
    throw new Error(`--since-commit could not resolve ${rev} in the current Git repository.`, {
      cause: error,
    });
  }
}

/** Sanitized runtime provenance recorded by supi-debug at session_start, or null. */
export function provenanceOf(entry) {
  if (entry?.type !== "custom" || entry.customType !== "supi-debug-event") return null;
  const event = entry.data;
  if (event?.category !== "runtime-provenance" || event.source !== "supi-debug") return null;
  const data = event.data ?? {};
  const provenance = {};
  for (const key of ["version", "commit", "commitTime"])
    if (typeof data[key] === "string") provenance[key] = data[key];
  if (typeof data.dirty === "boolean") provenance.dirty = data.dirty;
  return provenance;
}

/**
 * Admit a report whose session code is at least as new as `sinceCommit`.
 * Reports without a recorded commit time are rejected and counted.
 */
export function admitByCommit(item, sinceCommit, coverage) {
  if (!sinceCommit) return true;
  const time = Date.parse(item.provenance?.commitTime ?? "");
  if (!Number.isFinite(time)) {
    coverage.unknownProvenance++;
    return false;
  }
  return time >= Date.parse(sinceCommit.commitTime);
}
