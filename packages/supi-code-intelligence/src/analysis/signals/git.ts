import { execFileSync } from "node:child_process";
import {
  createEvidenceList,
  type EvidenceListMetadata,
  renderEvidenceListMetadataDisclosure,
} from "../evidence.ts";

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

/**
 * Render Git context, using already assembled dirty-file metadata when the
 * caller has it so every presentation surface shares the same evidence bounds.
 */
export function formatGitContext(ctx: GitContext, evidence?: EvidenceListMetadata): string {
  const dirtyEvidence =
    evidence ??
    createEvidenceList({
      key: "health.dirtyFiles",
      items: ctx.dirtyFiles,
      maxResults: 5,
    }).metadata;
  const lines: string[] = [];
  lines.push("## Git Context");
  lines.push("");
  lines.push(`Branch: \`${ctx.branch}\``);
  if (dirtyEvidence.shownCount > 0) {
    const total = dirtyEvidence.totalCount ?? dirtyEvidence.shownCount;
    const countLabel = dirtyEvidence.totalCount === null ? `at least ${total}` : String(total);
    lines.push(`Uncommitted: ${countLabel} file${total !== 1 ? "s" : ""}`);
    for (const file of ctx.dirtyFiles.slice(0, dirtyEvidence.shownCount)) {
      lines.push(`- \`${file}\``);
    }
    const disclosure = renderEvidenceListMetadataDisclosure(dirtyEvidence);
    if (disclosure) lines.push(disclosure);
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
