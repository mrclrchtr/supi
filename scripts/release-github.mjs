import { execFileSync } from "node:child_process";

/** Call GitHub through gh; only an explicit 404 may be treated as an absent resource. */
export function github(path, { method = "GET", body, allowMissing = false } = {}) {
  const args = ["api", path, "--method", method];
  if (body !== undefined) args.push("--input", "-");
  try {
    const output = execFileSync("gh", args, {
      input: body === undefined ? undefined : JSON.stringify(body),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output.trim() ? JSON.parse(output) : null;
  } catch (error) {
    if (allowMissing && /\(HTTP 404\)/.test(error.stderr ?? "")) return null;
    throw error;
  }
}

/** Recognize this repository's Release Please app and branch, never a title alone. */
export function isReleasePullRequest(pr, repository) {
  return (
    pr.user?.login === "mrclrchtr-bot[bot]" &&
    pr.user?.type === "Bot" &&
    pr.head?.repo?.full_name === repository &&
    pr.base?.repo?.full_name === repository &&
    pr.base?.ref === "main" &&
    pr.head?.ref === "release-please--branches--main--components--supi-workspace" &&
    pr.labels?.some(({ name }) => ["autorelease: pending", "autorelease: tagged"].includes(name))
  );
}

/** Fail closed unless a trusted, merged release PR identifies the verified commit/version. */
export function requireReleasePullRequest(pr, repository, sha, version) {
  if (
    !isReleasePullRequest(pr, repository) ||
    pr.merged !== true ||
    pr.merge_commit_sha !== sha ||
    pr.title !== `chore: release ${version}`
  ) {
    throw new Error("Expected a trusted merged release PR matching the candidate SHA and version");
  }
}
