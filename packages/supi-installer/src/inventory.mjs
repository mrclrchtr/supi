import { realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fingerprint, isRecord, readObject } from "./files.mjs";
import { canonicalPath, expandPath } from "./paths.mjs";
import { classifySources } from "./sources.mjs";

/** @typedef {import('./types.ts').Context} Context */
/** @typedef {import('./types.ts').PackageEntry} PackageEntry */

/** Resolve a project directory without selecting a Git root. @param {{project?: string, cwd?: string, agentDir?: string, home?: string}} [options] @returns {Context} */
export function createContext(options = {}) {
  const home = options.home ?? homedir();
  const cwd = options.cwd ?? process.cwd();
  const project = realpathSync(resolve(cwd, expandPath(options.project ?? cwd, home)));
  if (!statSync(project).isDirectory()) throw new Error(`Not a project directory: ${project}`);
  const agentDir = resolve(
    cwd,
    expandPath(
      options.agentDir ?? (process.env.PI_CODING_AGENT_DIR || join(home, ".pi/agent")),
      home,
    ),
  );
  const settingsPaths = {
    project: join(project, ".pi/settings.json"),
    global: join(agentDir, "settings.json"),
  };
  if (canonicalPath(settingsPaths.project) === canonicalPath(settingsPaths.global))
    throw new Error(
      "Global and project settings resolve to the same file. Select separate scopes before using the installer.",
    );
  return { project, agentDir, home, settingsPaths };
}

/** @param {Context} context @param {Record<string, string | null>} files */
function requireTrust(context, files) {
  const path = join(context.agentDir, "trust.json");
  const data = readObject(path, files);
  if (Object.values(data).some((value) => value !== true && value !== false && value !== null))
    throw new Error(`Invalid decision in ${path}`);
  let current = context.project;
  while (true) {
    const decision = Object.hasOwn(data, current) ? data[current] : null;
    if (decision === true) return;
    if (decision === false || dirname(current) === current) break;
    current = dirname(current);
  }
  throw new Error(
    `A saved Pi trust approval is required for ${context.project}. Open Pi in that directory, use /trust, then rerun the installer.`,
  );
}

/** Validate only the package fields that this CLI must interpret. @param {unknown} entry @param {string} path @returns {PackageEntry} */
function validateEntry(entry, path) {
  if (typeof entry === "string" && entry.trim()) return entry;
  if (!isRecord(entry) || typeof entry.source !== "string" || !entry.source.trim())
    throw new Error(`Invalid package source in ${path}`);
  for (const key of ["extensions", "skills", "prompts", "themes"]) {
    if (
      entry[key] !== undefined &&
      (!Array.isArray(entry[key]) || !entry[key].every((value) => typeof value === "string"))
    )
      throw new Error(`Invalid ${key} in ${path}`);
  }
  if (entry.autoload !== undefined && typeof entry.autoload !== "boolean")
    throw new Error(`Invalid autoload in ${path}`);
  return /** @type {PackageEntry} */ (entry);
}

/** Observe both scopes without starting Pi or changing settings or trust. @param {Context} context @returns {import('./types.ts').Inventory} */
export function readInventory(context) {
  /** @type {Record<string, string | null>} */
  const files = {};
  requireTrust(context, files);
  /** @type {Record<import('./types.ts').Scope, PackageEntry[]>} */
  const entries = { project: [], global: [] };
  for (const scope of /** @type {const} */ (["project", "global"])) {
    const path = context.settingsPaths[scope];
    const data = readObject(path, files);
    if (data.packages !== undefined && !Array.isArray(data.packages))
      throw new Error(`Invalid packages in ${path}`);
    entries[scope] = (data.packages ?? []).map((entry) => validateEntry(entry, path));
  }
  const inventory = {
    context,
    entries,
    blocked: { project: [], global: [] },
    unmanaged: { project: [], global: [] },
    files,
    fingerprint: "",
  };
  classifySources(inventory);
  inventory.fingerprint = fingerprint(files);
  return inventory;
}
