// Library entry point for instruction-file discovery shared with other SuPi packages.

import { findAncestorInstructionFiles } from "./analysis/instruction-files.ts";
import { loadCodeIntelligenceConfig } from "./config.ts";

export { findAncestorInstructionFiles };

/**
 * Effective `instructionFileNames` for a workspace, in priority order. Project configuration
 * applies only when the project is trusted; otherwise global configuration and defaults apply.
 */
export function resolveInstructionFileNames(cwd: string, projectTrusted: boolean): string[] {
  return [...loadCodeIntelligenceConfig(cwd, undefined, projectTrusted).instructionFileNames];
}
