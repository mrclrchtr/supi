import type { WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
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
