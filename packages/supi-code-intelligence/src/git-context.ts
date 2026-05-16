import { execFileSync } from "node:child_process";

function scrubGitEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env };
  for (const key of Object.keys(next)) {
    if (key.startsWith("GIT_")) {
      delete next[key];
    }
  }
  return next;
}

function execGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    env: scrubGitEnv(process.env),
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5000,
  });
}

export interface GitContext {
  branch: string;
  dirtyFiles: string[];
  lastCommitMessage: string | null;
}

export function gatherGitContext(cwd: string): GitContext | null {
  try {
    const branch = execGit(cwd, ["branch", "--show-current"]).trim();

    const status = execGit(cwd, ["status", "--porcelain"]).trim();

    const dirtyFiles = status
      .split("\n")
      .filter(Boolean)
      .map((line) => line.slice(3).trim());

    let lastCommitMessage: string | null = null;
    try {
      lastCommitMessage = execGit(cwd, ["log", "-1", "--format=%s"]).trim();
    } catch {
      // No commits yet
    }

    return { branch, dirtyFiles, lastCommitMessage };
  } catch {
    return null;
  }
}

export function formatGitContext(ctx: GitContext): string {
  const lines: string[] = [];
  lines.push("## Git Context");
  lines.push("");
  lines.push(`Branch: \`${ctx.branch}\``);
  if (ctx.dirtyFiles.length > 0) {
    lines.push(
      `Uncommitted: ${ctx.dirtyFiles.length} file${ctx.dirtyFiles.length !== 1 ? "s" : ""}`,
    );
    for (const f of ctx.dirtyFiles.slice(0, 5)) {
      lines.push(`- \`${f}\``);
    }
    if (ctx.dirtyFiles.length > 5) {
      lines.push(`- _+${ctx.dirtyFiles.length - 5} more_`);
    }
  } else {
    lines.push("Working tree clean.");
  }
  if (ctx.lastCommitMessage) {
    lines.push(`Last commit: \`${ctx.lastCommitMessage}\``);
  }
  lines.push("");
  return lines.join("\n");
}
