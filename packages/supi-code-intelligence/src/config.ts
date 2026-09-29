// Code Intelligence configuration and settings registration.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  loadAutomaticExclusionPatterns,
  loadSupiConfig,
  loadSupiConfigForScope,
} from "@mrclrchtr/supi-core/config";
import {
  defineConfigSettings,
  registerSettings,
  type SettingsModule,
} from "@mrclrchtr/supi-core/settings";

const CODE_INTELLIGENCE_SECTION = "code-intelligence";

/** User-facing configuration for the code-intelligence extension. */
export interface CodeIntelligenceConfig extends Record<string, unknown> {
  /** Ordered directory-local instruction file names to surface during directory orientation. */
  instructionFileNames: string[];
  /** Inject the hidden first-turn workspace architecture overview when enabled. */
  overviewEnabled: boolean;
  /** Gitignore-style paths excluded from automatic LSP and broad AST work. */
  exclude: string[];
}

/** Default code-intelligence configuration. */
export const CODE_INTELLIGENCE_DEFAULTS: CodeIntelligenceConfig = {
  instructionFileNames: ["CLAUDE.md", "AGENTS.md"],
  overviewEnabled: true,
  exclude: [],
};

/** Load merged code-intelligence configuration for a workspace. */
export function loadCodeIntelligenceConfig(
  cwd: string,
  homeDir?: string,
  projectTrusted = true,
): CodeIntelligenceConfig {
  const loaded = projectTrusted
    ? loadSupiConfig(CODE_INTELLIGENCE_SECTION, cwd, CODE_INTELLIGENCE_DEFAULTS, { homeDir })
    : loadSupiConfigForScope(CODE_INTELLIGENCE_SECTION, cwd, CODE_INTELLIGENCE_DEFAULTS, {
        scope: "global",
        homeDir,
      });
  return loaded;
}

/**
 * Resolve the overview setting for one session boundary.
 *
 * Project-scoped values apply only when the project is trusted (ADR 0002's
 * global/trusted-project scope precedence). Only a strict boolean `true`
 * enables injection; any other value, including malformed non-boolean
 * values, fails closed. Unreadable or invalid config files and non-object
 * sections fall back to defaults through the shared supi-core loader, the
 * same semantics every other SuPi setting uses; fail-closed covers values
 * inside a well-formed section.
 */
export function resolveOverviewEnabled(
  cwd: string,
  projectTrusted: boolean,
  homeDir?: string,
): boolean {
  const config = loadCodeIntelligenceConfig(cwd, homeDir, projectTrusted);
  return config.overviewEnabled === true;
}

/** Register code-intelligence settings with the shared SuPi settings registry. */
export function registerCodeIntelligenceSettings(pi: ExtensionAPI, homeDir?: string): void {
  const module = defineConfigSettings({
    id: CODE_INTELLIGENCE_SECTION,
    label: "Code Intelligence",
    section: CODE_INTELLIGENCE_SECTION,
    defaults: CODE_INTELLIGENCE_DEFAULTS,
    fields: [
      {
        kind: "stringList" as const,
        key: "instructionFileNames",
        label: "Instruction File Names",
        description: "Directory-local instruction file names shown by directory orientation",
      },
      {
        kind: "boolean" as const,
        key: "overviewEnabled",
        label: "Overview Enabled",
        description: "Inject the hidden first-turn workspace architecture overview",
      },
      {
        kind: "stringList" as const,
        key: "exclude",
        label: "Automatic Exclusions",
        description:
          "Gitignore-style patterns for automatic LSP and broad AST work. Edit the project or global config, then reload or restart Pi; exact requests stay available.",
      },
    ],
    ...(homeDir ? { homeDir } : {}),
  });
  registerSettings(pi, {
    ...module,
    async read(context: Parameters<SettingsModule["read"]>[0]) {
      loadAutomaticExclusionPatterns(context.cwd, {
        homeDir,
        projectTrusted: context.ctx?.isProjectTrusted() ?? true,
      });
      return module.read(context);
    },
  });
}
