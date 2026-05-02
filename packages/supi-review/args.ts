import type { ReviewDepth, ReviewTarget } from "./types.ts";

const USAGE = `Usage:
  /supi-review base-branch <branch> [--depth inherit|fast|deep] [--auto-fix|--no-auto-fix]
  /supi-review uncommitted [--depth inherit|fast|deep] [--auto-fix|--no-auto-fix]
  /supi-review commit <sha> [--depth inherit|fast|deep] [--auto-fix|--no-auto-fix]
  /supi-review custom [--depth inherit|fast|deep] [--auto-fix|--no-auto-fix] -- <instructions...>`;

export interface ParsedArgs {
  ok: true;
  target: ReviewTarget;
  depth: ReviewDepth;
  autoFix: boolean | undefined;
}

export interface ParseError {
  ok: false;
  error: string;
}

function extractFlags(parts: string[]): {
  depth: ReviewDepth;
  autoFix: boolean | undefined;
  remaining: string[];
} {
  let depth: ReviewDepth = "inherit";
  let autoFix: boolean | undefined;
  const dashDashIndex = parts.indexOf("--");
  const searchLimit = dashDashIndex === -1 ? parts.length : dashDashIndex;

  const remaining: string[] = [];
  for (let i = 0; i < searchLimit; i++) {
    if (parts[i] === "--depth" && i + 1 < searchLimit) {
      const d = parts[i + 1];
      if (d === "inherit" || d === "fast" || d === "deep") {
        depth = d;
        i++;
        continue;
      }
    }
    if (parts[i] === "--auto-fix") {
      autoFix = true;
      continue;
    }
    if (parts[i] === "--no-auto-fix") {
      autoFix = false;
      continue;
    }
    remaining.push(parts[i] ?? "");
  }

  return {
    depth,
    autoFix,
    remaining:
      dashDashIndex === -1
        ? remaining
        : remaining.concat(["--", ...parts.slice(dashDashIndex + 1)]),
  };
}

export function parseNonInteractiveArgs(args: string): ParsedArgs | ParseError {
  const parts = args.trim().split(/\s+/);
  if (parts.length === 0 || (parts.length === 1 && !parts[0])) {
    return { ok: false, error: USAGE };
  }

  const subcommand = parts[0];
  const { depth, autoFix, remaining } = extractFlags(parts);

  switch (subcommand) {
    case "base-branch": {
      if (remaining.length < 2) return { ok: false, error: `Missing branch name.\n${USAGE}` };
      return {
        ok: true,
        target: { type: "base-branch", branch: remaining[1] ?? "", diff: "" },
        depth,
        autoFix,
      };
    }
    case "uncommitted": {
      return { ok: true, target: { type: "uncommitted", diff: "" }, depth, autoFix };
    }
    case "commit": {
      if (remaining.length < 2) return { ok: false, error: `Missing commit SHA.\n${USAGE}` };
      return {
        ok: true,
        target: { type: "commit", sha: remaining[1] ?? "", show: "" },
        depth,
        autoFix,
      };
    }
    case "custom": {
      const instrParts = remaining.slice(1);
      const dd = instrParts.indexOf("--");
      if (dd >= 0) instrParts.splice(dd, 1);
      const instructions = instrParts.join(" ").trim();
      if (!instructions) return { ok: false, error: `Missing custom instructions.\n${USAGE}` };
      return { ok: true, target: { type: "custom", instructions }, depth, autoFix };
    }
    default:
      return { ok: false, error: `Unknown subcommand: ${subcommand}\n${USAGE}` };
  }
}
