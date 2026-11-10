import { execFile } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const GIT_TIMEOUT_MS = 2_000;
const WORKSPACE_PACKAGE_NAME = "@mrclrchtr/supi-workspace";

/** Debug category for the per-session record of the loaded SuPi code. */
export const RUNTIME_PROVENANCE_CATEGORY = "runtime-provenance";

/**
 * Which SuPi code a session ran. Git fields are present only when SuPi loads
 * from its own workspace checkout; published installs report the version only.
 */
export interface RuntimeProvenance {
  version: string;
  commit?: string;
  /** Committer date of `commit` (ISO 8601). */
  commitTime?: string;
  /** Tracked files differed from `commit` when the session started. */
  dirty?: boolean;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
  });
  return stdout.trim();
}

function readJson(path: string): { name?: unknown; version?: unknown } {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Git facts for the SuPi workspace containing `packageDir`, or nothing when the
 * package is not loaded from that checkout (e.g. an npm install inside another
 * repository, whose commits would be misattributed).
 */
async function workspaceGit(packageDir: string): Promise<Omit<RuntimeProvenance, "version">> {
  const root = resolve(packageDir, "../..");
  if (readJson(join(root, "package.json")).name !== WORKSPACE_PACKAGE_NAME) return {};
  try {
    const [top, head, status] = await Promise.all([
      git(root, ["rev-parse", "--show-toplevel"]),
      git(root, ["log", "-1", "--format=%H%n%cI"]),
      git(root, ["status", "--porcelain", "--untracked-files=no"]),
    ]);
    // Git prints the symlink-resolved top level (e.g. /private/var on macOS).
    if (realpathSync(top) !== realpathSync(root)) return {};
    const [commit, commitTime] = head.split("\n");
    return commit && commitTime ? { commit, commitTime, dirty: status.length > 0 } : {};
  } catch {
    return {};
  }
}

/** Collect provenance for the package at `packageDir`; never throws. */
export async function collectRuntimeProvenance(packageDir: string): Promise<RuntimeProvenance> {
  const version = readJson(join(packageDir, "package.json")).version;
  return {
    version: typeof version === "string" ? version : "unknown",
    ...(await workspaceGit(packageDir)),
  };
}
