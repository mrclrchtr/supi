import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { loadSupiConfig, loadSupiConfigForScope } from "@mrclrchtr/supi-core/config";

/** The persisted SuPi configuration section owned by this package. */
export const CONSULTING_CONFIG_SECTION = "consulting";

/** Configuration for Consulting availability and the consulting_run tool. */
export interface ConsultingConfig extends Record<string, unknown> {
  /** Enable agent availability discovery and the consulting_run tool. */
  agentToolEnabled: boolean;
  /** Absolute directories available for inspection with either Workspace Access selection. */
  additionalReadOnlyDirectories: readonly string[];
}

/** Default Consulting configuration. */
export const CONSULTING_DEFAULTS: ConsultingConfig = Object.freeze({
  agentToolEnabled: true,
  additionalReadOnlyDirectories: Object.freeze([]),
});

/** Load trusted scoped configuration; untrusted projects cannot grant external directory access. */
export function loadConsultingConfig(
  cwd: string,
  homeDir?: string,
  projectTrusted = true,
): ConsultingConfig {
  const raw = projectTrusted
    ? loadSupiConfig(CONSULTING_CONFIG_SECTION, cwd, CONSULTING_DEFAULTS, { homeDir })
    : loadSupiConfigForScope(CONSULTING_CONFIG_SECTION, cwd, CONSULTING_DEFAULTS, {
        scope: "global",
        homeDir,
      });
  return {
    agentToolEnabled:
      typeof raw.agentToolEnabled === "boolean"
        ? raw.agentToolEnabled
        : CONSULTING_DEFAULTS.agentToolEnabled,
    additionalReadOnlyDirectories: validateAdditionalReadOnlyDirectories(
      raw.additionalReadOnlyDirectories,
    ),
  };
}

/** Validate directory-list syntax before persistence or execution; paths are literal, not globs. */
export function validateAdditionalReadOnlyDirectories(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some((path) => typeof path !== "string" || !isAbsolute(path) || path.includes("\0"))
  ) {
    throw new Error(
      "consulting.additionalReadOnlyDirectories must be a list of absolute directory paths.",
    );
  }
  return [...new Set(value)];
}

/** Resolve current scoped grants for each run, following directory aliases and failing before process work. */
export async function resolveAdditionalReadOnlyDirectories(
  cwd: string,
  homeDir?: string,
  projectTrusted = true,
): Promise<string[]> {
  const config = loadConsultingConfig(cwd, homeDir, projectTrusted);
  const directories = await Promise.all(
    config.additionalReadOnlyDirectories.map(async (path) => {
      try {
        const canonical = await realpath(path);
        if (!(await stat(canonical)).isDirectory()) throw new Error("Not a directory.");
        await access(canonical, constants.R_OK | constants.X_OK);
        return canonical;
      } catch (error) {
        throw new Error(
          `Consulting additional read-only directory is missing, inaccessible, or not a directory: ${path}`,
          { cause: error },
        );
      }
    }),
  );
  return [...new Set(directories)];
}
