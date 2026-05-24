import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

vi.mock("node:util", () => ({
  promisify: () => (file: string, args: string[], options: { cwd?: string; timeout?: number }) => {
    return execFileMock(file, args, options);
  },
}));

import {
  getCommitShow,
  getDiff,
  getLocalBranches,
  getMergeBase,
  getRecentCommits,
  getSnapshotFileContent,
  getSnapshotFileDiff,
  getUncommittedDiff,
} from "../../src/git.ts";

describe("git timeout propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execFileMock.mockResolvedValue({ stdout: "" });
  });

  it("getMergeBase passes timeout", async () => {
    await getMergeBase("/repo", "main");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["merge-base", "HEAD", "main"],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it("getDiff passes timeout", async () => {
    await getDiff("/repo", "abc123");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["diff", "abc123"],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it("getUncommittedDiff passes timeout to all subprocesses", async () => {
    await getUncommittedDiff("/repo");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["diff", "--cached"],
      expect.objectContaining({ timeout: 30_000 }),
    );
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["diff"],
      expect.objectContaining({ timeout: 30_000 }),
    );
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["ls-files", "--others", "--exclude-standard"],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it("getRecentCommits passes timeout", async () => {
    await getRecentCommits("/repo", 10);
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["log", "--max-count=10", "--pretty=format:%H %s"],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it("getCommitShow passes timeout", async () => {
    await getCommitShow("/repo", "abc123");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["show", "abc123"],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it("getLocalBranches passes timeout to all subprocesses", async () => {
    await getLocalBranches("/repo");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["branch", "--format=%(refname:short)"],
      expect.objectContaining({ timeout: 30_000 }),
    );
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["branch", "--show-current"],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it("getSnapshotFileDiff passes timeout for working tree", async () => {
    const snapshot = {
      target: { kind: "working-tree" as const },
      title: "Working tree changes",
      changedFiles: ["file.txt"],
      diffText: "",
      stats: { files: 1, additions: 0, deletions: 0 },
    };
    await getSnapshotFileDiff("/repo", snapshot, "file.txt");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["diff", "HEAD", "--", "file.txt"],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it("getSnapshotFileDiff passes timeout for commit", async () => {
    const snapshot = {
      target: { kind: "commit" as const, sha: "abc123" },
      title: "Commit",
      changedFiles: ["file.txt"],
      diffText: "",
      stats: { files: 1, additions: 0, deletions: 0 },
    };
    await getSnapshotFileDiff("/repo", snapshot, "file.txt");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["show", "abc123", "--", "file.txt"],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it("getSnapshotFileContent passes timeout for before content", async () => {
    const snapshot = {
      target: { kind: "working-tree" as const },
      title: "Working tree changes",
      changedFiles: ["file.txt"],
      diffText: "",
      stats: { files: 1, additions: 0, deletions: 0 },
    };
    await getSnapshotFileContent("/repo", snapshot, "file.txt", "before");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["show", "HEAD:file.txt"],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });
});
