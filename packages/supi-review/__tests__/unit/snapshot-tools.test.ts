import { describe, expect, it, vi } from "vitest";

const mockGetSnapshotFileDiff = vi.hoisted(() => vi.fn());
const mockGetSnapshotFileContent = vi.hoisted(() => vi.fn());

vi.mock("../../src/git.ts", () => ({
  getSnapshotFileDiff: mockGetSnapshotFileDiff,
  getSnapshotFileContent: mockGetSnapshotFileContent,
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  defineTool: vi.fn((tool) => tool),
}));

vi.mock("typebox", () => ({
  Type: {
    Object: vi.fn((schema: Record<string, unknown>) => schema),
    String: vi.fn(() => ({ type: "string" })),
    Union: vi.fn((options: unknown[]) => ({ type: "union", options })),
    Literal: vi.fn((value: string) => ({ type: "literal", value })),
  },
}));

import { createSnapshotDiffTool, createSnapshotFileTool } from "../../src/tool/snapshot-tools.ts";

const cwd = "/repo";
const snapshot = {
  target: { kind: "working-tree" as const },
  title: "Working tree changes",
  changedFiles: ["src/file1.ts", "src/file2.ts"],
  diffText: "",
  stats: { files: 2, additions: 10, deletions: 2 },
};

describe("createSnapshotDiffTool", () => {
  it("returns a tool definition with the correct name and description", () => {
    const tool = createSnapshotDiffTool(cwd, snapshot);
    expect(tool.name).toBe("read_snapshot_diff");
    expect(tool.description).toBeTruthy();
  });

  it("returns the diff for a valid changed file", async () => {
    mockGetSnapshotFileDiff.mockResolvedValue(
      "diff --git a/src/file1.ts b/src/file1.ts\n+new line",
    );
    const tool = createSnapshotDiffTool(cwd, snapshot) as {
      execute: (...args: unknown[]) => Promise<{ content: Array<{ type: string; text: string }> }>;
    };
    const result = await tool.execute("call-1", { file: "src/file1.ts" });
    expect(mockGetSnapshotFileDiff).toHaveBeenCalledWith(cwd, snapshot, "src/file1.ts");
    expect(result.content[0]?.text).toContain("+new line");
  });

  it("returns an error for a file not in the changed files list", async () => {
    const tool = createSnapshotDiffTool(cwd, snapshot) as {
      execute: (...args: unknown[]) => Promise<{ content: Array<{ type: string; text: string }> }>;
    };
    const result = await tool.execute("call-2", { file: "src/other.ts" });
    expect(result.content[0]?.text).toContain("not in the snapshot");
  });
});

describe("createSnapshotFileTool", () => {
  it("returns a tool definition with the correct name and description", () => {
    const tool = createSnapshotFileTool(cwd, snapshot);
    expect(tool.name).toBe("read_snapshot_file");
    expect(tool.description).toBeTruthy();
  });

  it("returns before content for a valid changed file", async () => {
    mockGetSnapshotFileContent.mockResolvedValue("before content");
    const tool = createSnapshotFileTool(cwd, snapshot) as {
      execute: (...args: unknown[]) => Promise<{ content: Array<{ type: string; text: string }> }>;
    };
    const result = await tool.execute("call-3", { file: "src/file1.ts", side: "before" });
    expect(mockGetSnapshotFileContent).toHaveBeenCalledWith(
      cwd,
      snapshot,
      "src/file1.ts",
      "before",
    );
    expect(result.content[0]?.text).toBe("before content");
  });

  it("returns after content for a valid changed file", async () => {
    mockGetSnapshotFileContent.mockResolvedValue("after content");
    const tool = createSnapshotFileTool(cwd, snapshot) as {
      execute: (...args: unknown[]) => Promise<{ content: Array<{ type: string; text: string }> }>;
    };
    const result = await tool.execute("call-4", { file: "src/file1.ts", side: "after" });
    expect(mockGetSnapshotFileContent).toHaveBeenCalledWith(cwd, snapshot, "src/file1.ts", "after");
    expect(result.content[0]?.text).toBe("after content");
  });

  it("returns an error for a file not in the changed files list", async () => {
    const tool = createSnapshotFileTool(cwd, snapshot) as {
      execute: (...args: unknown[]) => Promise<{ content: Array<{ type: string; text: string }> }>;
    };
    const result = await tool.execute("call-5", { file: "src/other.ts", side: "before" });
    expect(result.content[0]?.text).toContain("not in the snapshot");
  });

  it("returns a message when content is unavailable", async () => {
    mockGetSnapshotFileContent.mockResolvedValue(undefined);
    const tool = createSnapshotFileTool(cwd, snapshot) as {
      execute: (...args: unknown[]) => Promise<{ content: Array<{ type: string; text: string }> }>;
    };
    const result = await tool.execute("call-6", { file: "src/file1.ts", side: "before" });
    expect(result.content[0]?.text).toContain("not available");
  });
});
