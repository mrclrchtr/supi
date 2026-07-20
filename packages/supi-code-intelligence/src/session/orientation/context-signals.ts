import type { WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import { gatherGitContext } from "../../analysis/signals/git.ts";
import { summarizePrioritySignalsForFiles } from "../../analysis/signals/project.ts";
import type { OrientationBlock } from "../orientation-types.ts";

/** Build bounded diagnostic Priority Signal blocks from a live LSP snapshot. */
export function collectPrioritySignalBlocks(
  cwd: string,
  files: Iterable<string>,
  lspRuntime: WorkspaceLspRuntimeState,
): OrientationBlock[] {
  const summary = summarizePrioritySignalsForFiles(cwd, files, lspRuntime);
  if (!summary || summary.warnings.length === 0) return [];
  return [
    { kind: "heading", level: 2, text: "Priority Signals" },
    ...summary.warnings.slice(0, 3).map((text): OrientationBlock => ({ kind: "list-item", text })),
    { kind: "blank" },
  ];
}

/** Build optional Git Orientation blocks from the current repository snapshot. */
export function collectGitContextBlocks(root: string, showGitContext: boolean): OrientationBlock[] {
  if (!showGitContext) return [];
  const context = gatherGitContext(root);
  if (!context) return [];

  const blocks: OrientationBlock[] = [
    { kind: "heading", level: 2, text: "Git Context" },
    { kind: "blank" },
    { kind: "paragraph", text: `Branch: \`${context.branch}\`` },
  ];
  if (context.dirtyFiles.length === 0) {
    blocks.push({ kind: "paragraph", text: "Working tree clean." });
  } else {
    blocks.push({
      kind: "paragraph",
      text: `Uncommitted: ${context.dirtyFiles.length} file${context.dirtyFiles.length === 1 ? "" : "s"}`,
    });
    for (const file of context.dirtyFiles.slice(0, 5)) {
      blocks.push({ kind: "list-item", text: `\`${file}\`` });
    }
  }
  if (context.lastCommitMessage) {
    blocks.push({ kind: "paragraph", text: `Last commit: \`${context.lastCommitMessage}\`` });
  }
  blocks.push({ kind: "blank" });
  return blocks;
}
