import { execFileSync } from "node:child_process";

export interface GitContext {
  branch: string;
  dirtyFiles: string[];
  lastCommitMessage: string | null;
}

export function gatherGitContext(cwd: string): GitContext | null {
  try {
    const branch = execFileSync("git", ["branch", "--show-current"], {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    const dirtyFiles = status
      .split("\n")
      .filter(Boolean)
      .map((line) => line.slice(3).trim());

    let lastCommitMessage: string | null = null;
    try {
      lastCommitMessage = execFileSync("git", ["log", "-1", "--format=%s"], {
        cwd,
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
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
