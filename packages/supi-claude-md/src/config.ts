// Configuration for supi-claude-md.
//
// Config shape (in supi shared config, "claude-md" section):
// {
//   "subdirs": true,           // enable subdirectory context discovery
//   "fileNames": ["CLAUDE.md", "AGENTS.md"]  // context file names to look for
// }

import { loadSupiConfig } from "@mrclrchtr/supi-core";

export interface ClaudeMdConfig {
  /** Enable subdirectory context discovery. Default: true */
  subdirs: boolean;
  /** Context file names to look for (first match per directory). Default: ["CLAUDE.md", "AGENTS.md"] */
  fileNames: string[];
}

export const CLAUDE_MD_DEFAULTS: ClaudeMdConfig = {
  subdirs: true,
  fileNames: ["CLAUDE.md", "AGENTS.md"],
};

export function loadClaudeMdConfig(cwd: string, homeDir?: string): ClaudeMdConfig {
  return loadSupiConfig("claude-md", cwd, CLAUDE_MD_DEFAULTS, { homeDir });
}
