// Code Intelligence configuration and settings registration.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadSupiConfig, loadSupiConfigForScope } from "@mrclrchtr/supi-core/config";
import { defineConfigSettings, registerSettings } from "@mrclrchtr/supi-core/settings";

const CODE_INTELLIGENCE_SECTION = "code-intelligence";

/** User-facing configuration for the code-intelligence extension. */
export interface CodeIntelligenceConfig extends Record<string, unknown> {
  /** Ordered directory-local instruction file names to surface during directory orientation. */
  instructionFileNames: string[];
  /** Inject the hidden first-turn workspace architecture overview when enabled. */
  overviewEnabled: boolean;
}

/** Default code-intelligence configuration. */
export const CODE_INTELLIGENCE_DEFAULTS: CodeIntelligenceConfig = {
  instructionFileNames: ["CLAUDE.md", "AGENTS.md"],
  overviewEnabled: true,
};

/** Load merged code-intelligence configuration for a workspace. */
export function loadCodeIntelligenceConfig(cwd: string, homeDir?: string): CodeIntelligenceConfig {
  return loadSupiConfig(CODE_INTELLIGENCE_SECTION, cwd, CODE_INTELLIGENCE_DEFAULTS, { homeDir });
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
  const config = projectTrusted
    ? loadCodeIntelligenceConfig(cwd, homeDir)
    : loadSupiConfigForScope(CODE_INTELLIGENCE_SECTION, cwd, CODE_INTELLIGENCE_DEFAULTS, {
        scope: "global",
        homeDir,
      });
  return config.overviewEnabled === true;
}

/** Register code-intelligence settings with the shared SuPi settings registry. */
export function registerCodeIntelligenceSettings(pi: ExtensionAPI, homeDir?: string): void {
  registerSettings(
    pi,
    defineConfigSettings({
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
      ],
      ...(homeDir ? { homeDir } : {}),
    }),
  );
}
