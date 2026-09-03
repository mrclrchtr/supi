import {
  formatAntigravityLoginCommand,
  getIsolatedAntigravityPaths,
  type IsolatedAntigravityPaths,
} from "./isolated-home.ts";
import type { AntigravityProbeResult } from "./process/runner.ts";
import { AntigravityProcessError, runAntigravityProbe } from "./process/runner.ts";
import { CURATED_MODELS, type CuratedModel, isCuratedModel } from "./types.ts";

/** Minimum supported Antigravity CLI version. */
export const MINIMUM_ANTIGRAVITY_VERSION = Object.freeze({ major: 1, minor: 1, patch: 24 });
const MAX_DISCOVERY_OUTPUT_BYTES = 128 * 1024;

/** Parsed Antigravity CLI version. */
export interface AntigravityVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

/** A successful immutable availability snapshot. */
export interface AvailableAntigravity {
  status: "available";
  cliVersion: string;
  catalogue: readonly CuratedModel[];
}

/** A bounded reason why the tool cannot be registered. */
export interface UnavailableAntigravity {
  status: "unavailable";
  reason: "missing" | "old-version" | "authentication" | "discovery" | "no-curated-model";
  warning: string;
  cliVersion?: string;
}

/** Result of one immutable Antigravity availability discovery. */
export type AntigravityAvailability = AvailableAntigravity | UnavailableAntigravity;

/** Parse the first semantic version in CLI output. */
export function parseAntigravityVersion(output: string): AntigravityVersion | undefined {
  const match = output.match(/\b(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?\b/);
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    ...(match[4] ? { prerelease: match[4] } : {}),
  };
}

/** Return whether a parsed version meets the supported minimum. */
export function isSupportedAntigravityVersion(version: AntigravityVersion): boolean {
  const minimum = MINIMUM_ANTIGRAVITY_VERSION;
  if (version.major !== minimum.major) return version.major > minimum.major;
  if (version.minor !== minimum.minor) return version.minor > minimum.minor;
  if (version.patch !== minimum.patch) return version.patch > minimum.patch;
  return version.prerelease === undefined;
}

/** Format a version without retaining the CLI's complete output. */
export function formatAntigravityVersion(version: AntigravityVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

/** Parse bounded tab-separated `agy models` output. */
export function parseAvailableModels(output: string): string[] {
  if (Buffer.byteLength(output, "utf8") > MAX_DISCOVERY_OUTPUT_BYTES) {
    throw new Error("Antigravity model output exceeded its limit.");
  }
  const found = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    for (const field of line.split("\t")) {
      const model = field.trim();
      if (isCuratedModel(model)) found.add(model);
    }
  }
  return [...found];
}

/** Intersect discovered IDs with the immutable curated model order. */
export function intersectCuratedModels(discovered: Iterable<string>): readonly CuratedModel[] {
  const available = new Set(discovered);
  return Object.freeze(CURATED_MODELS.filter((model) => available.has(model)));
}

/** Discover the supported Antigravity models in the Isolated Antigravity Home. */
export async function discoverAntigravityAvailability(
  options: {
    paths?: IsolatedAntigravityPaths;
    signal?: AbortSignal;
    runProbe?: typeof runAntigravityProbe;
  } = {},
): Promise<AntigravityAvailability> {
  const paths = options.paths ?? getIsolatedAntigravityPaths();
  const runProbe = options.runProbe ?? runAntigravityProbe;
  let versionResult: AntigravityProbeResult;
  try {
    versionResult = await runProbe({
      paths,
      cwd: paths.consultationWorkspace,
      args: ["--version"],
      signal: options.signal,
      timeoutMs: 15_000,
      maxStdoutBytes: MAX_DISCOVERY_OUTPUT_BYTES,
    });
  } catch (error) {
    return unavailableFromError(error, paths);
  }

  const version = parseAntigravityVersion(`${versionResult.stdout}\n${versionResult.stderr}`);
  if (!version || versionResult.exitCode !== 0 || versionResult.signal) {
    return {
      status: "unavailable",
      reason: "discovery",
      warning:
        "Antigravity CLI version could not be read. Install or update Antigravity, then reload PI.",
    };
  }
  const cliVersion = formatAntigravityVersion(version);
  if (!isSupportedAntigravityVersion(version)) {
    return {
      status: "unavailable",
      reason: "old-version",
      cliVersion,
      warning: `Antigravity CLI ${cliVersion} is too old; version ${formatAntigravityVersion(MINIMUM_ANTIGRAVITY_VERSION)} or newer is required.`,
    };
  }

  let modelsResult: AntigravityProbeResult;
  try {
    modelsResult = await runProbe({
      paths,
      cwd: paths.consultationWorkspace,
      args: ["models"],
      signal: options.signal,
      timeoutMs: 30_000,
      maxStdoutBytes: MAX_DISCOVERY_OUTPUT_BYTES,
    });
  } catch (error) {
    return unavailableFromError(error, paths, cliVersion);
  }
  const modelOutput = `${modelsResult.stdout}\n${modelsResult.stderr}`;
  if (looksUnauthenticated(modelOutput)) return authenticationUnavailable(paths, cliVersion);
  if (modelsResult.exitCode !== 0 || modelsResult.signal) {
    return {
      status: "unavailable",
      reason: "discovery",
      cliVersion,
      warning:
        "Antigravity model discovery failed. Check the isolated Antigravity sign-in, then reload PI.",
    };
  }

  let catalogue: readonly CuratedModel[];
  try {
    catalogue = intersectCuratedModels(parseAvailableModels(modelsResult.stdout));
  } catch {
    return {
      status: "unavailable",
      reason: "discovery",
      cliVersion,
      warning: "Antigravity model discovery output exceeded its limit.",
    };
  }
  if (catalogue.length === 0) {
    return {
      status: "unavailable",
      reason: "no-curated-model",
      cliVersion,
      warning: "No supported curated Antigravity model is available to this account.",
    };
  }
  return { status: "available", cliVersion, catalogue };
}

function unavailableFromError(
  error: unknown,
  paths: IsolatedAntigravityPaths,
  cliVersion?: string,
): UnavailableAntigravity {
  if (error instanceof AntigravityProcessError && error.kind === "missing") {
    return {
      status: "unavailable",
      reason: "missing",
      warning: "Antigravity CLI `agy` was not found on PATH. Install it, then reload PI.",
    };
  }
  if (
    looksUnauthenticated(
      error instanceof AntigravityProcessError
        ? `${error.message}\n${error.stderr ?? ""}`
        : error instanceof Error
          ? error.message
          : "",
    )
  ) {
    return authenticationUnavailable(paths, cliVersion);
  }
  return {
    status: "unavailable",
    reason: "discovery",
    ...(cliVersion ? { cliVersion } : {}),
    warning: "Antigravity availability discovery failed. Check the installation, then reload PI.",
  };
}

function authenticationUnavailable(
  paths: IsolatedAntigravityPaths,
  cliVersion?: string,
): UnavailableAntigravity {
  return {
    status: "unavailable",
    reason: "authentication",
    ...(cliVersion ? { cliVersion } : {}),
    warning: `Antigravity needs sign-in in its Isolated Antigravity Home. Run:\n${formatAntigravityLoginCommand(paths)}\nThen exit Antigravity and reload PI.`,
  };
}

function looksUnauthenticated(value: string): boolean {
  const normalized = value.toLowerCase();
  return [
    "please sign in",
    "not authenticated",
    "authentication required",
    "unauthorized",
    "sign-in required",
    "login required",
    "log in",
  ].some((marker) => normalized.includes(marker));
}
