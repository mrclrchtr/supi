import { spawn } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { StringDecoder } from "node:string_decoder";

interface BxRunOptions {
  cwd: string;
  signal?: AbortSignal;
}

interface BxProcessResult {
  stdout: string;
  exitCode: number | null;
}

type BxFailureKind = "cancelled" | "missing" | "start";

/** Return a safe message for a documented bx process exit category. */
export function formatBxExitFailure(exitCode: number | null | typeof BX_MISSING_KEY_EXIT): string {
  switch (exitCode) {
    case 1:
      return "bx web search failed: client error. Check the query and request.";
    case 2:
      return "bx web search failed: CLI usage or compatibility error. Check the bx version.";
    case BX_MISSING_KEY_EXIT:
      return BX_MISSING_KEY_MESSAGE;
    case 3:
      return "bx web search failed: authentication or permission error. Check bx credentials and service access.";
    case 4:
      return "bx web search failed: rate limit reached. Try again later.";
    case 5:
      return "bx web search failed: server or network error. Check network access and try again later.";
    default:
      return `bx web search failed: unknown bx error (exit code ${exitCode ?? "unknown"}).`;
  }
}

/** Pseudo exit category for a usage error caused by a missing local API key. */
const BX_MISSING_KEY_EXIT = "missing-key";

/** Safe next step for a missing Brave API key. */
export const BX_MISSING_KEY_MESSAGE =
  "bx web search failed: no Brave API key configured. Run `bx config set-key` or set BRAVE_SEARCH_API_KEY in the environment that starts Pi.";

/** Upper bound for the local key check; it never makes a network request. */
const BX_KEY_CHECK_TIMEOUT_MS = 2000;

class BxProcessFailure extends Error {
  constructor(readonly kind: BxFailureKind) {
    super(kind);
  }
}

/**
 * Total token budget requested from Brave for one search, half the service default of about
 * 8,192. The default returned about 30 sources and 30,000 characters per call; see
 * `docs/ops/web-search-design.md` § Result size.
 */
export const WEB_SEARCH_MAX_TOKENS = 4096;

/** Build the direct argv used for one bx context request. */
export function buildBxContextArgs(query: string, freshness?: string): string[] {
  return [
    "context",
    "--max-tokens",
    String(WEB_SEARCH_MAX_TOKENS),
    ...(freshness === undefined ? [] : ["--extra", `freshness=${freshness}`]),
    "--",
    query,
  ];
}

/** Check PATH without starting bx or reading its configuration. */
export function isBxAvailable(
  pathValue = process.env.PATH,
  platform = process.platform,
  pathExtValue = process.env.PATHEXT,
): boolean {
  if (!pathValue) return false;

  const names = platform === "win32" ? windowsCommandNames(pathExtValue) : ["bx"];
  const pathDelimiter = platform === "win32" ? ";" : delimiter;
  return pathValue
    .split(pathDelimiter)
    .some((directory) =>
      names.some((name) => isExecutable(join(directory || ".", name), platform)),
    );
}

/** Run one bx context request and decode its JSON stdout. */
export async function runBxContext(
  query: string,
  freshness: string | undefined,
  options: BxRunOptions,
): Promise<unknown> {
  const result = await invokeBx(buildBxContextArgs(query, freshness), options);
  if (result.exitCode === 2 && (await hasBxApiKey(options.cwd)) === false) {
    // bx also uses exit 2 when no key is configured; distinguish it without reading stderr.
    throw new Error(formatBxExitFailure(BX_MISSING_KEY_EXIT));
  }
  if (result.exitCode !== 0) {
    throw new Error(formatBxExitFailure(result.exitCode));
  }

  try {
    return JSON.parse(result.stdout) as unknown;
  } catch {
    // biome-ignore lint/style/useErrorCause: Keep parser details out of tool errors.
    throw new Error("bx returned invalid JSON for web search.");
  }
}

/**
 * Detect a locally configured Brave API key without a network request or quota use.
 *
 * `BRAVE_SEARCH_API_KEY` counts as configured. Otherwise `bx config show-key` reads only the
 * bx config file: exit 0 means a key exists, exit 2 means none. Output is discarded so the
 * masked key never leaves the process. Returns `undefined` when the result is unknown
 * (timeout, start failure, or an unexpected exit code), so callers must not treat it as missing.
 * The check cannot prove that a key is valid; invalid keys remain call-time errors.
 */
export async function hasBxApiKey(cwd: string): Promise<boolean | undefined> {
  if (process.env.BRAVE_SEARCH_API_KEY?.trim()) return true;

  const exitCode = await runBxQuiet(["config", "show-key"], cwd, BX_KEY_CHECK_TIMEOUT_MS);
  if (exitCode === 0) return true;
  if (exitCode === 2) return false;
  return undefined;
}

function runBxQuiet(args: string[], cwd: string, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(exitCode);
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("bx", args, { cwd, shell: false, stdio: "ignore" });
    } catch {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // The process may have already exited.
      }
      finish(null);
    }, timeoutMs);
    child.once("error", () => finish(null));
    child.once("close", (exitCode: number | null) => finish(exitCode));
  });
}

function windowsCommandNames(pathExtValue: string | undefined): string[] {
  const extensions = (pathExtValue ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean);
  return ["bx", ...extensions.map((extension) => `bx${extension}`)];
}

function isExecutable(filePath: string, platform: NodeJS.Platform): boolean {
  try {
    if (!statSync(filePath).isFile()) return false;
    accessSync(filePath, platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function invokeBx(args: string[], options: BxRunOptions): Promise<BxProcessResult> {
  if (options.signal?.aborted) throw new Error("Web search was cancelled.");

  return new Promise<BxProcessResult>((resolve, reject) => {
    const decoder = new StringDecoder("utf8");
    let stdout = "";
    let settled = false;
    let cancelled = false;
    let child: ReturnType<typeof spawn>;

    try {
      child = spawn("bx", args, {
        cwd: options.cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      reject(new BxProcessFailure("start"));
      return;
    }

    const cleanup = () => {
      options.signal?.removeEventListener("abort", onAbort);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => {
      cancelled = true;
      try {
        child.kill();
      } catch {
        // The process may have already exited.
      }
      finish(() => reject(new BxProcessFailure("cancelled")));
    };

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += typeof chunk === "string" ? chunk : decoder.write(chunk);
    });
    child.stderr?.on("data", () => {
      // Drain stderr. Its contents must not enter model-visible errors.
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      finish(() => {
        if (cancelled) {
          reject(new BxProcessFailure("cancelled"));
        } else if (error.code === "ENOENT") {
          reject(new BxProcessFailure("missing"));
        } else {
          reject(new BxProcessFailure("start"));
        }
      });
    });
    child.once("close", (exitCode: number | null) => {
      finish(() => resolve({ stdout: `${stdout}${decoder.end()}`, exitCode }));
    });

    if (options.signal) {
      options.signal.addEventListener("abort", onAbort, { once: true });
    }
  }).catch((error: unknown): BxProcessResult => {
    if (error instanceof BxProcessFailure) {
      if (error.kind === "cancelled") throw new Error("Web search was cancelled.");
      if (error.kind === "missing") throw new Error("bx executable was not found on PATH.");
      throw new Error("Could not start bx for web search.");
    }
    throw new Error("Could not start bx for web search.");
  });
}
