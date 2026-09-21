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
export function formatBxExitFailure(exitCode: number | null): string {
  switch (exitCode) {
    case 1:
      return "bx web search failed: client error. Check the query and request.";
    case 2:
      return "bx web search failed: CLI usage or compatibility error. Check the bx version.";
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

class BxProcessFailure extends Error {
  constructor(readonly kind: BxFailureKind) {
    super(kind);
  }
}

/** Build the direct argv used for one bx context request. */
export function buildBxContextArgs(query: string, freshness?: string): string[] {
  return [
    "context",
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
