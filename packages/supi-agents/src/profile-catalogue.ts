import { execFile } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { realpathOrResolve } from "./path.ts";
import {
  makeDiagnostic,
  type ProfileCandidate,
  validateProfileDirectory,
} from "./profile-validation.ts";
import {
  type AgentProfile,
  MAX_PROFILE_COUNT,
  type ProfileCatalogue,
  type ProfileDiagnostic,
  type ProfileSource,
} from "./types.ts";

const execFileAsync = promisify(execFile);
const packageProfilesDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../profiles");

interface ProfileSourceDirectory {
  readonly source: ProfileSource;
  readonly directory: string | undefined;
}

/** Inputs for one immutable profile catalogue snapshot. */
export interface DiscoverProfileCatalogueOptions {
  /** Session cwd used for trusted-project profile lookup. */
  readonly cwd: string;
  /** PI agent directory, normally returned by getAgentDir(). */
  readonly agentDir: string;
  /** Whether PI has already trusted the current project. */
  readonly projectTrusted: boolean;
  /** Package profile root; defaults to this package's bundled profiles. */
  readonly packageDirectory?: string;
}

/** Discover package, global, and trusted-project profiles with whole-directory precedence. */
export async function discoverProfileCatalogue(
  options: DiscoverProfileCatalogueOptions,
): Promise<ProfileCatalogue> {
  const projectDirectory = options.projectTrusted
    ? await findProjectProfilesDirectory(options.cwd)
    : undefined;
  const sources: readonly ProfileSourceDirectory[] = [
    { source: "package", directory: options.packageDirectory ?? packageProfilesDirectory },
    { source: "global", directory: join(options.agentDir, "supi", "agents") },
    { source: "project", directory: projectDirectory },
  ];
  const selected = selectEffectiveCandidates(sources);
  const sortedProfileIds = [...selected.keys()].sort(compareProfileIds);
  const profileIds = sortedProfileIds.slice(0, MAX_PROFILE_COUNT);
  const profiles: AgentProfile[] = [];
  const diagnostics: ProfileDiagnostic[] = [];

  for (const id of profileIds) {
    const candidate = selected.get(id);
    if (!candidate) continue;
    if (candidate.profile) profiles.push(candidate.profile);
    if (candidate.diagnostic) diagnostics.push(candidate.diagnostic);
  }

  const omittedProfileCount = Math.max(0, sortedProfileIds.length - profileIds.length);
  if (omittedProfileCount > 0) {
    const firstOmitted = selected.get(sortedProfileIds[profileIds.length]);
    diagnostics.push(
      makeDiagnostic(
        "(overflow)",
        firstOmitted?.source ?? "package",
        "catalogue-overflow",
        `${omittedProfileCount} additional profile IDs were omitted by the ${MAX_PROFILE_COUNT}-profile catalogue limit.`,
      ),
    );
  }

  return Object.freeze({
    profiles: Object.freeze(profiles),
    diagnostics: Object.freeze(diagnostics),
    profileIds: Object.freeze(profileIds),
    omittedProfileCount,
  });
}

/** Locate the nearest trusted project profile directory. */
export async function findProjectProfilesDirectory(cwd: string): Promise<string | undefined> {
  const resolvedCwd = realpathOrResolve(cwd);
  const gitRoot = await findGitRoot(resolvedCwd);
  if (!gitRoot) {
    const exact = join(resolvedCwd, ".pi", "supi", "agents");
    return isDirectory(exact) ? exact : undefined;
  }

  let current = resolvedCwd;
  while (true) {
    const candidate = join(current, ".pi", "supi", "agents");
    if (isDirectory(candidate)) return candidate;
    if (current === gitRoot) return undefined;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function selectEffectiveCandidates(
  sources: readonly ProfileSourceDirectory[],
): Map<string, ProfileCandidate> {
  const selected = new Map<string, ProfileCandidate>();
  for (const source of sources) {
    for (const candidate of readProfileSource(source)) selected.set(candidate.id, candidate);
  }
  return selected;
}

function readProfileSource(source: ProfileSourceDirectory): ProfileCandidate[] {
  const directory = source.directory;
  if (!directory || !isDirectory(directory)) return [];
  try {
    return readdirSync(directory, { withFileTypes: true, encoding: "utf8" })
      .filter((entry) => entry.isDirectory())
      .map((entry) => validateProfileDirectory(source.source, join(directory, entry.name)))
      .sort((left, right) => compareProfileIds(left.id, right.id));
  } catch {
    return [];
  }
}

function compareProfileIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

async function findGitRoot(cwd: string): Promise<string | undefined> {
  try {
    const result = await execFileAsync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      cwd,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
      ),
    });
    const root = result.stdout.trim();
    return root ? realpathOrResolve(root) : undefined;
  } catch {
    return undefined;
  }
}
