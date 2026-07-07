// Code Intelligence configuration and settings registration.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadSupiConfig } from "@mrclrchtr/supi-core/config";
import { registerDeclarativeSettings } from "@mrclrchtr/supi-core/settings";

const CODE_INTELLIGENCE_SECTION = "code-intelligence";

/** User-facing configuration for the code-intelligence extension. */
export interface CodeIntelligenceConfig extends Record<string, unknown> {
  /** Ordered directory-local instruction file names to surface during directory orientation. */
  instructionFileNames: string[];
}

/** Default code-intelligence configuration. */
export const CODE_INTELLIGENCE_DEFAULTS: CodeIntelligenceConfig = {
  instructionFileNames: ["CLAUDE.md", "AGENTS.md"],
};

/** Load merged code-intelligence configuration for a workspace. */
export function loadCodeIntelligenceConfig(cwd: string, homeDir?: string): CodeIntelligenceConfig {
  return loadSupiConfig(CODE_INTELLIGENCE_SECTION, cwd, CODE_INTELLIGENCE_DEFAULTS, { homeDir });
}

/** Register code-intelligence settings with the shared SuPi settings registry. */
export function registerCodeIntelligenceSettings(pi: ExtensionAPI, homeDir?: string): void {
  registerDeclarativeSettings(pi, {
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
    ],
    ...(homeDir ? { homeDir } : {}),
  });
}
