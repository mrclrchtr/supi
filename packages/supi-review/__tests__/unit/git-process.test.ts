import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile: execFileMock }));
vi.mock("node:util", () => ({
  promisify: () => (file: string, args: string[], options: unknown) =>
    execFileMock(file, args, options),
}));

import { resolveReviewSnapshot } from "../../src/git.ts";

describe("Git process boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execFileMock.mockImplementation((_file: string, args: string[]) => {
      if (args.includes("--show-toplevel")) return Promise.resolve({ stdout: process.cwd() });
      if (args[0] === "rev-parse") return Promise.resolve({ stdout: "a".repeat(40) });
      return Promise.resolve({ stdout: "" });
    });
  });

  it("applies a finite timeout and strips inherited GIT_* variables", async () => {
    await resolveReviewSnapshot(process.cwd(), { kind: "working-tree" });

    expect(execFileMock).toHaveBeenCalled();
    for (const call of execFileMock.mock.calls) {
      expect(call[2]).toEqual(
        expect.objectContaining({ timeout: 30_000, maxBuffer: 50 * 1024 * 1024 }),
      );
      expect(
        Object.keys((call[2] as { env: Record<string, string | undefined> }).env).some(
          (key) => key.startsWith("GIT_") && key !== "GIT_INDEX_FILE",
        ),
      ).toBe(false);
    }
  });

  it("propagates operational failures instead of reporting no changes", async () => {
    execFileMock.mockRejectedValue(Object.assign(new Error("git unavailable"), { code: "ENOENT" }));

    await expect(resolveReviewSnapshot(process.cwd(), { kind: "working-tree" })).rejects.toThrow(
      "git unavailable",
    );
  });
});
