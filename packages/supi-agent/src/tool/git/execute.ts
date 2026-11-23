import { execFile } from "node:child_process";
import { GIT_READ_SUBCOMMANDS } from "./input.ts";

const GIT_TIMEOUT_MS = 30_000;
/**
 * Collection cap, well above Pi's model-facing output limit so truncation still reports
 * line counts for typical output, while bounding memory for full-history queries.
 */
const GIT_MAX_BUFFER_BYTES = 1024 * 1024;
const MAX_STDERR_CHARS = 2000;

const DIFF_FAMILY = new Set(["diff", "log", "show"]);
/** Long options that write files or re-enable configured diff programs. */
const FORBIDDEN_LONG_OPTIONS = ["output", "ext-diff", "textconv"];

/** Raw Git output; `capped` marks output cut at the collection limit. */
export interface GitQueryOutput {
  readonly stdout: string;
  readonly capped: boolean;
}

/**
 * Return why the arguments are rejected, or undefined when they form an admitted read query.
 * Repository configuration is trusted like the user's own Git; this policy limits what the
 * model can choose, not what the repository configures.
 */
export function rejectGitArgs(args: readonly string[]): string | undefined {
  const [subcommand, ...rest] = args;
  if (!(GIT_READ_SUBCOMMANDS as readonly string[]).includes(subcommand ?? "")) {
    const allowed = `the first argument must be one of: ${GIT_READ_SUBCOMMANDS.join(", ")}.`;
    // Name the token: a leading option such as `-c` otherwise reads like a missing subcommand.
    return subcommand?.startsWith("-")
      ? `Option ${JSON.stringify(subcommand)} before the subcommand is not allowed; ${allowed}`
      : `${JSON.stringify(subcommand ?? "")} is not an allowed subcommand; ${allowed}`;
  }
  for (const arg of rest) {
    if (arg === "--") break;
    if (arg.includes("\0")) return "Arguments must not contain NUL characters.";
    const forbidden = forbiddenLongOption(arg);
    if (forbidden) return `--${forbidden} is not allowed.`;
    if (subcommand === "status" && isVerboseFlag(arg)) {
      return "Verbose status is not allowed; use diff instead.";
    }
  }
  return undefined;
}

/** Match exact names and Git's unique-prefix abbreviations, including `--no-` forms. */
function forbiddenLongOption(arg: string): string | undefined {
  if (!arg.startsWith("--")) return undefined;
  const name = arg.slice(2).split("=", 1)[0] ?? "";
  if (name.length === 0) return undefined;
  // `--text` is an exact diff option, not an abbreviation of `--textconv`.
  if (name === "text") return undefined;
  const positive = name.startsWith("no-") ? name.slice(3) : name;
  if (positive === "ext-diff" || positive === "textconv") {
    // Disabling forms are harmless; only re-enabling forms are rejected.
    return name.startsWith("no-") ? undefined : positive;
  }
  return FORBIDDEN_LONG_OPTIONS.find((option) => option.startsWith(name));
}

function isVerboseFlag(arg: string): boolean {
  if (arg.startsWith("--")) return "verbose".startsWith(arg.slice(2)) && arg.length > 2;
  return /^-[^-]*v/u.test(arg);
}

/** Build the final argv: global safety options, subcommand, its safety flags, then caller args. */
export function buildGitArgv(args: readonly string[]): string[] {
  const [subcommand = "", ...rest] = args;
  const flags = DIFF_FAMILY.has(subcommand)
    ? ["--no-ext-diff", "--no-textconv"]
    : subcommand === "blame"
      ? ["--no-textconv"]
      : [];
  return [
    "--no-pager",
    "--no-optional-locks",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "color.ui=false",
    subcommand,
    ...flags,
    ...rest,
  ];
}

function gitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  return { ...env, GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat", GIT_OPTIONAL_LOCKS: "0" };
}

/** Run an admitted query. Throws with bounded stderr when Git fails. */
export function runGitQuery(
  cwd: string,
  args: readonly string[],
  signal?: AbortSignal,
): Promise<GitQueryOutput> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      buildGitArgv(args),
      {
        cwd,
        env: gitEnv(),
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER_BYTES,
        ...(signal ? { signal } : {}),
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, capped: false });
          return;
        }
        if ((error as { code?: unknown }).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
          resolve({ stdout, capped: true });
          return;
        }
        const detail = stderr.trim().slice(0, MAX_STDERR_CHARS) || error.message;
        reject(new Error(`git ${args[0]} failed: ${detail}`));
      },
    );
    child.stdin?.end();
  });
}
