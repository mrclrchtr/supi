// Shared search helpers for code_intel actions.

import { execFileSync } from "node:child_process";
import * as path from "node:path";

const LOW_SIGNAL_DIRS = new Set([
  "node_modules",
  ".git",
  ".pnpm",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "coverage",
  ".turbo",
  ".cache",
]);

/** Check if a file path contains an obviously low-signal directory segment. */
export function isLowSignalPath(filePath: string): boolean {
  const segments = filePath.split(path.sep);
  return segments.some((s) => LOW_SIGNAL_DIRS.has(s));
}

/** Escape regex special characters. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normalize a file/path value: strip leading @, resolve relative to cwd. */
export function normalizePath(input: string, cwd: string): string {
  const stripped = input.startsWith("@") ? input.slice(1) : input;
  return path.resolve(cwd, stripped);
}

export interface RgMatch {
  file: string;
  line: number;
  text: string;
  /** Context lines surrounding this match (from -C flag). */
  context?: Array<{ line: number; text: string }>;
}

/** Run ripgrep with JSON output and parse matches, filtering low-signal paths. */
export function runRipgrep(
  pattern: string,
  scopePath: string,
  cwd: string,
  opts?: { maxMatches?: number; contextLines?: number; filterLowSignal?: boolean },
): RgMatch[] {
  const max = opts?.maxMatches ?? 30;
  const ctx = opts?.contextLines ?? 0;
  const filter = opts?.filterLowSignal ?? true;

  try {
    const args = ["--json", "-m", String(max)];
    if (ctx > 0) {
      args.push("-C", String(ctx));
    }
    args.push("-e", pattern, scopePath);

    const result = execFileSync("rg", args, {
      encoding: "utf-8",
      cwd,
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return parseRgJson(result, filter);
  } catch (err: unknown) {
    // rg exits 1 for no-match; treat as empty result
    if (isExecError(err) && err.stdout) {
      return parseRgJson(err.stdout as string, filter);
    }
    return [];
  }
}

function isExecError(err: unknown): err is { status: number; stdout: unknown } {
  return typeof err === "object" && err !== null && "status" in err;
}

interface RawRgEvent {
  type: string;
  data?: {
    path?: { text: string };
    line_number?: number;
    lines?: { text: string };
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: JSON ripgrep output parsing with context line collection
function parseRgJson(output: string, filterLowSignal: boolean): RgMatch[] {
  const matches: RgMatch[] = [];
  // Pending context lines that precede the next match
  let pendingContext: Array<{ line: number; text: string }> = [];

  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    let parsed: RawRgEvent;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed.type === "context" && parsed.data) {
      const lineNum = parsed.data.line_number;
      const text = (parsed.data.lines?.text ?? "").trim();
      if (lineNum) pendingContext.push({ line: lineNum, text });
      continue;
    }

    if (parsed.type === "match" && parsed.data) {
      const filePath = parsed.data.path?.text;
      const lineNum = parsed.data.line_number;
      const text = (parsed.data.lines?.text ?? "").trim();
      if (filePath && lineNum) {
        if (filterLowSignal && isLowSignalPath(filePath)) {
          pendingContext = [];
          continue;
        }
        const match: RgMatch = { file: filePath, line: lineNum, text };
        if (pendingContext.length > 0) {
          match.context = pendingContext;
          pendingContext = [];
        }
        matches.push(match);
      } else {
        pendingContext = [];
      }
      continue;
    }

    // Attach trailing context to the last match
    if (parsed.type === "context" && matches.length > 0) {
      // Already handled above
    }
  }

  // Attach any trailing context lines to the last match
  if (pendingContext.length > 0 && matches.length > 0) {
    const last = matches[matches.length - 1];
    last.context = [...(last.context ?? []), ...pendingContext];
  }

  return matches;
}

/** Group matches by file. */
export function groupByFile(matches: RgMatch[]): Map<string, RgMatch[]> {
  const byFile = new Map<string, RgMatch[]>();
  for (const m of matches) {
    const group = byFile.get(m.file) ?? [];
    group.push(m);
    byFile.set(m.file, group);
  }
  return byFile;
}
