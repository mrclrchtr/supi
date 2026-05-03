import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rtkRewrite, rtkRewriteDetailed } from "../rewrite.ts";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

describe("rtkRewrite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns rewritten command on success", () => {
    vi.mocked(execFileSync).mockReturnValue("rtk git status\n");
    const result = rtkRewrite("git status", 5000);
    expect(result).toBe("rtk git status");
    expect(execFileSync).toHaveBeenCalledWith("rtk", ["rewrite", "git status"], {
      encoding: "utf-8",
      timeout: 5000,
    });
  });

  it("returns stdout when rtk exits non-zero with a usable rewrite", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      const err = new Error("exit 3") as Error & { stdout?: string };
      err.stdout = "rtk git status\n";
      throw err;
    });

    const result = rtkRewrite("git status", 5000);
    expect(result).toBe("rtk git status");
  });

  it("returns undefined when rtk exits non-zero without stdout", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("exit 1");
    });

    const result = rtkRewrite("unknown-cmd", 5000);
    expect(result).toBeUndefined();
  });

  it("returns undefined on timeout", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      const err = new Error("timeout");
      (err as Error & { code?: string }).code = "ETIMEDOUT";
      throw err;
    });
    const result = rtkRewrite("git status", 100);
    expect(result).toBeUndefined();
  });

  it("trims whitespace from output", () => {
    vi.mocked(execFileSync).mockReturnValue("  rtk ls -la  \n");
    const result = rtkRewrite("ls -la", 5000);
    expect(result).toBe("rtk ls -la");
  });

  it("returns structured details for successful rewrites", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValueOnce(1000).mockReturnValueOnce(1012);
    vi.mocked(execFileSync).mockReturnValue("rtk git status\n");

    expect(rtkRewriteDetailed("git status", 5000)).toEqual({
      kind: "rewritten",
      command: "rtk git status",
      durationMs: 12,
      stdout: "rtk git status\n",
    });
    nowSpy.mockRestore();
  });

  it("returns structured details for unchanged rewrites", () => {
    vi.mocked(execFileSync).mockReturnValue("git status\n");

    expect(rtkRewriteDetailed("git status", 5000)).toMatchObject({
      kind: "unchanged",
      command: "git status",
    });
  });

  it("classifies empty output", () => {
    vi.mocked(execFileSync).mockReturnValue("\n");

    expect(rtkRewriteDetailed("git status", 5000)).toMatchObject({
      kind: "failed",
      reason: "empty-output",
    });
  });

  it("classifies missing binary", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      const err = new Error("spawn rtk ENOENT") as Error & { code?: string };
      err.code = "ENOENT";
      throw err;
    });

    expect(rtkRewriteDetailed("git status", 5000)).toMatchObject({
      kind: "failed",
      reason: "unavailable",
    });
  });

  it("classifies non-zero exits without stdout", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      const err = new Error("exit 1") as Error & { status?: number; stderr?: string };
      err.status = 1;
      err.stderr = "no rewrite";
      throw err;
    });

    expect(rtkRewriteDetailed("unknown-cmd", 5000)).toMatchObject({
      kind: "failed",
      reason: "non-zero-exit",
      exitCode: 1,
      stderr: "no rewrite",
    });
  });

  it("treats non-zero exits with usable stdout as successful", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      const err = new Error("exit 3") as Error & { status?: number; stdout?: string };
      err.status = 3;
      err.stdout = "rtk git status\n";
      throw err;
    });

    expect(rtkRewriteDetailed("git status", 5000)).toMatchObject({
      kind: "rewritten",
      command: "rtk git status",
      stdout: "rtk git status\n",
    });
  });
});
