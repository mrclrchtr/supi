import { resolveGitRepositoryRoot, runGit } from "./git-command.ts";

export interface CommitChoice {
  commit: string;
  label: string;
}

/** List local branches with resolved commit ids for the interactive adapter. */
export async function listLocalBranches(cwd: string): Promise<CommitChoice[]> {
  const root = await resolveGitRepositoryRoot(cwd);
  const output = await runGit(root, [
    "for-each-ref",
    // biome-ignore lint/security/noSecrets: Git format syntax, not a secret
    "--format=%(objectname)%00%(refname:short)",
    "refs/heads",
  ]);
  return output
    .trim()
    .split("\n")
    .flatMap((line) => {
      const [commit, label] = line.split("\0");
      return commit && label ? [{ commit, label }] : [];
    });
}

/** List recent commits with resolved ids for the interactive adapter. */
export async function listRecentCommits(cwd: string, limit = 30): Promise<CommitChoice[]> {
  const root = await resolveGitRepositoryRoot(cwd);
  const output = await runGit(root, [
    "log",
    `--max-count=${limit}`,
    // biome-ignore lint/security/noSecrets: Git format syntax, not a secret
    "--format=%H%x00%s",
  ]);
  return output
    .trim()
    .split("\n")
    .flatMap((line) => {
      const [commit, subject] = line.split("\0");
      return commit && subject ? [{ commit, label: `${commit.slice(0, 7)}  ${subject}` }] : [];
    });
}
