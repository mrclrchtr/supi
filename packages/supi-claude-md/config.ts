// Configuration for supi-claude-md.
//
// Config shape (in supi shared config, "claude-md" section):
// {
//   "rereadInterval": 3,      // turns between root/subdir refresh (0 = off)
//   "subdirs": true,           // enable subdirectory context discovery
//   "compactRefresh": true,    // re-inject after compaction
//   "fileNames": ["CLAUDE.md", "AGENTS.md"]  // context file names to look for
// }

import { loadSupiConfig } from "@mrclrchtr/supi-core";

export interface ClaudeMdConfig {
  /** Turns between root/subdir context refresh. 0 = disabled. Default: 3 */
  rereadInterval: number;
  /** Enable subdirectory context discovery. Default: true */
  subdirs: boolean;
  /** Re-inject after compaction. Default: true */
  compactRefresh: boolean;
  /** Context file names to look for (first match per directory). Default: ["CLAUDE.md", "AGENTS.md"] */
  fileNames: string[];
}

export const CLAUDE_MD_DEFAULTS: ClaudeMdConfig = {
  rereadInterval: 3,
  subdirs: true,
  compactRefresh: true,
  fileNames: ["CLAUDE.md", "AGENTS.md"],
};

export function loadClaudeMdConfig(cwd: string, homeDir?: string): ClaudeMdConfig {
  return loadSupiConfig("claude-md", cwd, CLAUDE_MD_DEFAULTS, { homeDir });
}
