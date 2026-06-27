import { execFileSync } from "node:child_process";
import { createEvidenceList, renderEvidenceListDisclosure } from "../presentation/evidence-list.ts";

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

    const dirtyFiles = status.split("\n").filter(Boolean).map(parsePorcelainPath);

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
    const evidence = createEvidenceList({
      key: "health.dirtyFiles",
      items: ctx.dirtyFiles,
      maxResults: 5,
    });
    for (const f of evidence.items) {
      lines.push(`- \`${f}\``);
    }
    const disclosure = renderEvidenceListDisclosure(evidence);
    if (disclosure) {
      lines.push(disclosure);
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

function parsePorcelainPath(line: string): string {
  const rawPath = line[2] === " " ? line.slice(3) : line.slice(2);
  const renameSeparator = " -> ";
  const renamedPath = rawPath.includes(renameSeparator)
    ? (rawPath.split(renameSeparator).at(-1) ?? rawPath)
    : rawPath;
  return renamedPath.trim();
}
