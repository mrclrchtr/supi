// biome-ignore-all lint/style/noExcessiveLinesPerFile: ripgrep abort/process handling, JSON parsing, and path/scope helpers are cohesive search infrastructure
// Shared search helpers for code-intelligence search and routing helpers.

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { resolveToolPath, uriToFile as uriToFileShared } from "@mrclrchtr/supi-core/path";

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
  "__pycache__",
  ".tsbuildinfo",
]);

/** Check if a file path contains an obviously low-signal directory segment. */
export function isLowSignalPath(filePath: string): boolean {
  const segments = filePath.split(path.sep);
  return segments.some((s) => LOW_SIGNAL_DIRS.has(s));
}

/** Convert a file:// URI to a file path, matching the shared SuPi normalization. */
export const uriToFile = uriToFileShared;

/** Check whether a resolved file path is inside the current project (within cwd, not under node_modules or .pnpm). */
export function isInProjectPath(filePath: string, cwd: string): boolean {
  const relativePath = path.relative(cwd, path.resolve(cwd, filePath));
  if (relativePath.startsWith(`..${path.sep}`) || relativePath === "..") return false;
  const normalized = relativePath.replaceAll("\\", "/");
  return !(
    normalized.includes("/node_modules/") ||
    normalized.startsWith("node_modules/") ||
    normalized.includes("/.pnpm/") ||
    normalized.startsWith(".pnpm/")
  );
}

/** Result of resolving a user-provided `scope` value to an absolute path. */
export type ScopeResolution = { kind: "ok"; path: string } | { kind: "error"; reason: string };

/**
 * Resolve a `scope` value to an absolute path using pi scope semantics:
 * - strip leading `@`
 * - resolve relative paths from `cwd`
 * - require the resolved path to exist
 */
export function resolveScope(scope: string | undefined, cwd: string): ScopeResolution {
  if (!scope) return { kind: "ok", path: cwd };
  const resolved = normalizePath(scope, cwd);
  if (!existsSync(resolved)) {
    return { kind: "error", reason: `Scope path not found: \`${scope}\`` };
  }
  return { kind: "ok", path: resolved };
}

/** Escape regex special characters. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normalize a file/path value: strip leading @, resolve relative to cwd. */
export function normalizePath(input: string, cwd: string): string {
  return resolveToolPath(cwd, input);
}

/** Render a file path relative to cwd when it is inside the workspace. */
export function toDisplayPath(cwd: string, filePath: string): string {
  if (!path.isAbsolute(filePath)) {
    return filePath.replaceAll("\\", "/");
  }

  const relativePath = path.relative(cwd, filePath);
  if (!relativePath || relativePath === ".") {
    return filePath;
  }
  if (relativePath.startsWith(`..${path.sep}`) || relativePath === "..") {
    return filePath;
  }

  return relativePath.replaceAll("\\", "/");
}

export interface RgMatch {
  file: string;
  line: number;
  text: string;
  /** Context lines surrounding this match (from -C flag). */
  context?: Array<{ line: number; text: string }>;
}

/** Result of a ripgrep invocation for callers that need both matches and execution errors. */
export interface RipgrepRunResult {
  /** Parsed ripgrep matches, if any. */
  matches: RgMatch[];
  /** Non-no-match ripgrep execution error text, such as invalid regex syntax. */
  error?: string;
}

/** Options for {@link runRipgrep} / {@link runRipgrepDetailed}. */
export interface RipgrepOptions {
  maxMatches?: number;
  contextLines?: number;
  literal?: boolean;
  filterLowSignal?: boolean;
  /**
   * Abort signal from the agent runtime. When aborted, the ripgrep child is
   * killed and the call rejects with {@link RipgrepAbortedError} so the
   * executor (and pi) can treat the tool call as cancelled rather than
   * silently completing with partial matches.
   */
  signal?: AbortSignal;
}

/** Hard upper bound on a single ripgrep invocation, matching the prior `execFileSync` timeout. */
const RIPGREP_TIMEOUT_MS = 10_000;

/**
 * Thrown by {@link runRipgrepDetailed} when the supplied `AbortSignal` fires.
 * Propagates out of executors so pi cancels the tool call instead of returning
 * partial results.
 */
export class RipgrepAbortedError extends Error {
  constructor(signal?: AbortSignal) {
    const reason = signal?.reason;
    super(reason instanceof Error ? reason.message : "ripgrep search was aborted");
    this.name = "RipgrepAbortedError";
  }
}

/**
 * Run ripgrep with JSON output and parse matches, filtering low-signal paths.
 *
 * Async and abort-aware: when `opts.signal` aborts, the ripgrep child is killed
 * and the returned promise rejects with {@link RipgrepAbortedError}. Any
 * non-abort ripgrep execution failure is still treated like an empty match set
 * (or surfaces an error via {@link runRipgrepDetailed}).
 */
export async function runRipgrep(
  pattern: string,
  scopePath: string,
  cwd: string,
  opts?: RipgrepOptions,
): Promise<RgMatch[]> {
  return (await runRipgrepDetailed(pattern, scopePath, cwd, opts)).matches;
}

/**
 * Run ripgrep and preserve non-no-match execution errors for callers that need
 * to distinguish invalid regex syntax from a genuine empty search result.
 * Abort-aware: rejects with {@link RipgrepAbortedError} when `opts.signal` fires.
 */
export async function runRipgrepDetailed(
  pattern: string,
  scopePath: string,
  cwd: string,
  opts?: RipgrepOptions,
): Promise<RipgrepRunResult> {
  const filter = opts?.filterLowSignal ?? true;
  let proc: RgProcessResult;
  try {
    proc = await runRgProcess(
      buildRipgrepArgs(pattern, scopePath, opts),
      cwd,
      RIPGREP_TIMEOUT_MS,
      opts?.signal,
    );
  } catch (err: unknown) {
    // Abort propagates so pi cancels the tool call. Any other unexpected spawn
    // failure is treated like an empty match set, preserving prior behavior.
    if (err instanceof RipgrepAbortedError) throw err;
    return { matches: [] };
  }

  switch (proc.kind) {
    case "missing":
      return {
        matches: [],
        error:
          "ripgrep (rg) is not available. Install it (e.g., `apt install ripgrep` or `brew install ripgrep`).",
      };
    case "ok":
    case "nomatch":
      return { matches: parseRgJson(proc.stdout, filter) };
    case "timeout":
      // Timeout: yield any partial stdout matches with no error surfaced — an
      // improvement over the prior execFileSync path, which discarded partial
      // output on timeout (the timeout error lacked a `status`, so the old
      // handleRipgrepError returned an empty match set).
      return { matches: proc.stdout ? parseRgJson(proc.stdout, filter) : [] };
    case "error":
      return {
        matches: proc.stdout ? parseRgJson(proc.stdout, filter) : [],
        ...(proc.stderr.trim() ? { error: proc.stderr.trim() } : {}),
      };
  }
}

function buildRipgrepArgs(
  pattern: string,
  scopePath: string,
  opts?: { maxMatches?: number; contextLines?: number; literal?: boolean },
): string[] {
  const args = ["--json", "-m", String(opts?.maxMatches ?? 30)];
  if ((opts?.contextLines ?? 0) > 0) {
    args.push("-C", String(opts?.contextLines ?? 0));
  }
  if (opts?.literal) {
    args.push("-F");
  }
  args.push("-e", pattern, scopePath);
  return args;
}

/** Discriminated result of a single ripgrep process run (see {@link runRgProcess}). */
type RgProcessResult =
  | { kind: "ok"; stdout: string; stderr: string; status: number }
  | { kind: "nomatch"; stdout: string; stderr: string; status: 1 }
  | { kind: "error"; stdout: string; stderr: string; status: number }
  | { kind: "timeout"; stdout: string; stderr: string }
  | { kind: "missing" };

/**
 * Spawn ripgrep, collect stdout/stderr, and resolve a discriminated result.
 * Rejects with {@link RipgrepAbortedError} when `signal` aborts (the child is
 * killed with SIGKILL). Maps exit codes: 0 → ok, 1 → nomatch, 2+ → error;
 * ENOENT → missing (rg not installed); timeout → timeout.
 */
function runRgProcess(
  args: string[],
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<RgProcessResult> {
  return new Promise<RgProcessResult>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn("rg", args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    } catch (err: unknown) {
      if (isCodeError(err, "ENOENT")) {
        resolve({ kind: "missing" });
        return;
      }
      reject(err);
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | null = null;

    const cleanup = (): void => {
      if (timer) clearTimeout(timer);
      if (abortListener && signal) signal.removeEventListener("abort", abortListener);
    };
    const settle = (r: RgProcessResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(r);
    };
    const failAbort = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        child.kill("SIGKILL");
      } catch {
        // Child may already have exited; ignore.
      }
      reject(new RipgrepAbortedError(signal));
    };

    // Fast path: signal already aborted before any work is scheduled.
    if (signal?.aborted) {
      failAbort();
      return;
    }

    child.stdout?.setEncoding("utf-8");
    child.stderr?.setEncoding("utf-8");
    child.stdout?.on("data", (d: string) => {
      stdout += d;
    });
    child.stderr?.on("data", (d: string) => {
      stderr += d;
    });

    timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // Ignore; the close handler will still fire.
      }
    }, timeoutMs);

    if (signal) {
      abortListener = () => failAbort();
      signal.addEventListener("abort", abortListener);
    }

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      if (isCodeError(err, "ENOENT")) {
        settle({ kind: "missing" });
        return;
      }
      settle({ kind: "error", stdout, stderr, status: -1 });
    });

    child.on("close", (status: number | null) => {
      if (settled) return;
      if (timedOut) {
        settle({ kind: "timeout", stdout, stderr });
        return;
      }
      if (status === 0) settle({ kind: "ok", stdout, stderr, status });
      else if (status === 1) settle({ kind: "nomatch", stdout, stderr, status });
      else settle({ kind: "error", stdout, stderr, status: status ?? -1 });
    });
  });
}

function isCodeError(err: unknown, code: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === code
  );
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
        // Split pendingContext: lines before this match are "before" context,
        // lines from before this match line that trail the previous match stay with it.
        const beforeCtx = pendingContext.filter((c) => c.line < lineNum);
        const trailingCtx = pendingContext.filter((c) => c.line >= lineNum);

        // Attach trailing context from previous match to the last accepted match
        if (beforeCtx.length > 0 && matches.length > 0) {
          const prev = matches[matches.length - 1];
          const prevTrailing = beforeCtx.filter((c) => c.line > prev.line);
          if (prevTrailing.length > 0) {
            prev.context = [...(prev.context ?? []), ...prevTrailing];
          }
        }

        if (filterLowSignal && isLowSignalPath(filePath)) {
          pendingContext = [];
          continue;
        }

        const match: RgMatch = { file: filePath, line: lineNum, text };
        // Leading context: lines just before this match
        const leadingCtx =
          matches.length > 0
            ? beforeCtx.filter(
                (c) => c.line <= lineNum && c.line > (matches[matches.length - 1]?.line ?? 0),
              )
            : beforeCtx;
        if (leadingCtx.length > 0) {
          match.context = leadingCtx;
        }
        // Also include any pending context at/after this match's line (trailing from rg ordering)
        pendingContext = trailingCtx;
        matches.push(match);
      } else {
        pendingContext = [];
      }
    }
  }

  // Attach any trailing context lines to the last match
  if (pendingContext.length > 0 && matches.length > 0) {
    const last = matches[matches.length - 1];
    last.context = [...(last.context ?? []), ...pendingContext];
  }

  return matches;
}

/**
 * Minimal interface for a reference-like object with a URI and range start.
 * Used by {@link filterOutDeclaration} to avoid coupling to a specific LspRef type.
 */
export interface HasLspPosition {
  uri: string;
  range: { start: { line: number; character: number } };
}

/**
 * Filter out the declaration/definition location from LSP references.
 * LSP's `textDocument/references` includes the declaration by default;
 * for callers/affected analysis, the declaration is not a call site or affected reference.
 *
 * Uses {@link uriToFile} for robust URI-to-path conversion.
 */
export function filterOutDeclaration<T extends HasLspPosition>(
  refs: T[],
  targetFile: string,
  targetPos: { line: number; character: number },
): T[] {
  return refs.filter((ref) => {
    const filePath = uriToFile(ref.uri);
    if (filePath !== targetFile) return true;
    const start = ref.range.start;
    return start.line !== targetPos.line || start.character !== targetPos.character;
  });
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
