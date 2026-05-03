import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rtkRewrite } from "../rewrite.ts";

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

  it("returns undefined when rtk exits non-zero", () => {
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
});
