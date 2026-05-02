import type { ReviewDepth, ReviewTarget } from "./types.ts";

const USAGE = `Usage:
  /supi-review base-branch <branch> [--depth inherit|fast|deep]
  /supi-review uncommitted [--depth inherit|fast|deep]
  /supi-review commit <sha> [--depth inherit|fast|deep]
  /supi-review custom [--depth inherit|fast|deep] -- <instructions...>`;

export interface ParsedArgs {
  ok: true;
  target: ReviewTarget;
  depth: ReviewDepth;
}

export interface ParseError {
  ok: false;
  error: string;
}

function extractDepth(parts: string[]): { depth: ReviewDepth; remaining: string[] } {
  let depth: ReviewDepth = "inherit";
  const dashDashIndex = parts.indexOf("--");
  const searchLimit = dashDashIndex === -1 ? parts.length : dashDashIndex;

  for (let i = 1; i < searchLimit; i++) {
    if (parts[i] === "--depth" && i + 1 < searchLimit) {
      const d = parts[i + 1];
      if (d === "inherit" || d === "fast" || d === "deep") {
        depth = d;
        const remaining = parts.slice(0, i).concat(parts.slice(i + 2));
        return { depth, remaining };
      }
    }
  }
  return { depth, remaining: parts };
}

export function parseNonInteractiveArgs(args: string): ParsedArgs | ParseError {
  const parts = args.trim().split(/\s+/);
  if (parts.length === 0 || (parts.length === 1 && !parts[0])) {
    return { ok: false, error: USAGE };
  }

  const subcommand = parts[0];
  const { depth, remaining } = extractDepth(parts);

  switch (subcommand) {
    case "base-branch": {
      if (remaining.length < 2) return { ok: false, error: `Missing branch name.\n${USAGE}` };
      return {
        ok: true,
        target: { type: "base-branch", branch: remaining[1] ?? "", diff: "" },
        depth,
      };
    }
    case "uncommitted": {
      return { ok: true, target: { type: "uncommitted", diff: "" }, depth };
    }
    case "commit": {
      if (remaining.length < 2) return { ok: false, error: `Missing commit SHA.\n${USAGE}` };
      return { ok: true, target: { type: "commit", sha: remaining[1] ?? "", show: "" }, depth };
    }
    case "custom": {
      const instrParts = remaining.slice(1);
      const dd = instrParts.indexOf("--");
      if (dd >= 0) instrParts.splice(dd, 1);
      const instructions = instrParts.join(" ").trim();
      if (!instructions) return { ok: false, error: `Missing custom instructions.\n${USAGE}` };
      return { ok: true, target: { type: "custom", instructions }, depth };
    }
    default:
      return { ok: false, error: `Unknown subcommand: ${subcommand}\n${USAGE}` };
  }
}
