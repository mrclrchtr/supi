import * as path from "node:path";
import { collectExtendedProjectConfigs } from "../config/tsconfig-extends.ts";
import { normalizeTsconfigPath } from "../config/tsconfig-path.ts";
import { getFileScopeDecision, projectConfigIncludesFile } from "../config/tsconfig-scope.ts";
import { type AutomaticLspPathPolicy, walkAutomaticLspTree } from "../workspace-path-policy.ts";

/** Directory depth searched for project configs below a TypeScript route root. */
const PROJECT_CONFIG_SCAN_DEPTH = 8;
/** Project config paths named in one coverage reason. */
const MAX_NAMED_PROJECTS = 3;
/** File names tsserver loads as projects; `tsconfig.*.json` variants are never auto-loaded. */
const LOADABLE_PROJECT_CONFIGS = new Set(["tsconfig.json", "jsconfig.json"]);

/** Find loadable project configs under a route root, honoring the automatic path policy. */
export function discoverTypeScriptProjectConfigs(
  root: string,
  policy: AutomaticLspPathPolicy,
): string[] {
  const configs: string[] = [];
  walkAutomaticLspTree(policy, root, PROJECT_CONFIG_SCAN_DEPTH, (directory, entries) => {
    for (const entry of entries) {
      if (entry.isFile() && LOADABLE_PROJECT_CONFIGS.has(entry.name)) {
        configs.push(path.join(directory, entry.name));
      }
    }
    return false;
  });
  return configs;
}

/**
 * Project configs whose program includes `file` but owns no open file.
 *
 * tsserver answers project-wide requests such as references and
 * implementations only from loaded projects, and loads a project only when one
 * of its files is open. An unloaded including project (typically a test
 * config that includes `../src`) can hold matches the answer omits.
 *
 * Base configs extended by another discovered config are skipped: their
 * default include usually spans the whole tree while they own only root
 * tooling files, so counting them would mark nearly every answer partial.
 */
export function findUnloadedTypeScriptProjects(options: {
  readonly file: string;
  readonly cwd: string;
  readonly openFiles: readonly string[];
  readonly configs: readonly string[];
}): string[] {
  const baseConfigs = new Set(
    options.configs.flatMap((config) => [...collectExtendedProjectConfigs(config)]),
  );
  const loaded = new Set<string>();
  for (const openFile of options.openFiles) {
    const decision = getFileScopeDecision(openFile, options.cwd);
    if (decision.status === "included" && decision.configPath) {
      loaded.add(normalizeTsconfigPath(decision.configPath));
    }
  }
  return options.configs.filter((config) => {
    const key = normalizeTsconfigPath(config);
    return (
      !loaded.has(key) && !baseConfigs.has(key) && projectConfigIncludesFile(config, options.file)
    );
  });
}

/** Actionable partial-result reason naming a bounded set of unloaded projects. */
export function typeScriptCoverageGapReason(unloaded: readonly string[], cwd: string): string {
  const named = unloaded
    .slice(0, MAX_NAMED_PROJECTS)
    .map((config) => path.relative(cwd, config) || path.basename(config));
  const more = unloaded.length > named.length ? `, +${unloaded.length - named.length} more` : "";
  const noun = unloaded.length === 1 ? "project that includes" : "projects that include";
  return (
    `TypeScript coverage is limited: ${unloaded.length} ${noun} this file ` +
    `${unloaded.length === 1 ? "is" : "are"} not loaded (${named.join(", ")}${more}). ` +
    "Open a file from each project and retry."
  );
}
