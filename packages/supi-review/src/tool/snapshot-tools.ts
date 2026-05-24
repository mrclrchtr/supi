import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { getSnapshotFileContent, getSnapshotFileDiff } from "../git.ts";
import type { ReviewSnapshot } from "../types.ts";

/** Create the read_snapshot_diff custom tool for the reviewer child session. */
export function createSnapshotDiffTool(
  cwd: string,
  snapshot: ReviewSnapshot,
): ReturnType<typeof defineTool> {
  return defineTool({
    name: "read_snapshot_diff",
    label: "Read Snapshot Diff",
    description:
      "Read the exact diff for a single changed file in the selected review snapshot. " +
      "The file must be in the snapshot's changed-files list.",
    parameters: Type.Object({
      file: Type.String(),
    }),
    execute: async (_toolCallId, args) => {
      const file = (args as { file: string }).file;
      if (!snapshot.changedFiles.includes(file)) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `Error: "${file}" is not in the snapshot's changed-files list. ` +
                "Use the changed-file manifest from the review task to pick a valid file.",
            },
          ],
          details: null,
        };
      }

      const diff = await getSnapshotFileDiff(cwd, snapshot, file);
      if (!diff.trim()) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `No diff available for "${file}" in this snapshot. ` +
                "The file may be untracked; use read_snapshot_file to inspect its current content.",
            },
          ],
          details: null,
        };
      }

      return {
        content: [{ type: "text" as const, text: diff }],
        details: null,
      };
    },
  });
}

/** Create the read_snapshot_file custom tool for the reviewer child session. */
export function createSnapshotFileTool(
  cwd: string,
  snapshot: ReviewSnapshot,
): ReturnType<typeof defineTool> {
  return defineTool({
    name: "read_snapshot_file",
    label: "Read Snapshot File",
    description:
      "Read the before or after content of a single changed file in the selected review snapshot. " +
      '"before" shows the file before the change (HEAD for working tree, base for branch, parent for commit). ' +
      '"after" shows the file after the change. The file must be in the snapshot\'s changed-files list.',
    parameters: Type.Object({
      file: Type.String(),
      side: Type.Union([Type.Literal("before"), Type.Literal("after")]),
    }),
    execute: async (_toolCallId, args) => {
      const { file, side } = args as { file: string; side: "before" | "after" };

      if (!snapshot.changedFiles.includes(file)) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `Error: "${file}" is not in the snapshot's changed-files list. ` +
                "Use the changed-file manifest from the review task to pick a valid file.",
            },
          ],
          details: null,
        };
      }

      const content = await getSnapshotFileContent(cwd, snapshot, file, side);

      if (content === undefined) {
        const hint =
          side === "before"
            ? "The file may be newly added or renamed (use read_snapshot_diff to check for renames)."
            : "The file may have been deleted.";
        return {
          content: [
            {
              type: "text" as const,
              text: `Content for "${file}" (${side}) is not available. ${hint}`,
            },
          ],
          details: null,
        };
      }

      return {
        content: [{ type: "text" as const, text: content }],
        details: null,
      };
    },
  });
}
