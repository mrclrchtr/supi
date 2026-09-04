import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scanWorkspaceSources } from "../../src/diagnostics/workspace-sources.ts";
import { createAutomaticLspPathPolicy } from "../../src/workspace-path-policy.ts";

let tmpDir = "";

afterEach(() => {
  vi.restoreAllMocks();
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = "";
  }
});

describe("workspace source inventory", () => {
  it("returns only policy-eligible files with configured LSP extensions", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-sources-"));
    for (const relativePath of [
      "src/app.ts",
      "src/app.js",
      ".pi/private.ts",
      "ignored/drop.ts",
      ".github/workflow.ts",
    ]) {
      const filePath = path.join(tmpDir, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "export {};\n");
    }
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), "ignored/\n");

    const inventory = await scanWorkspaceSources(tmpDir, {
      fileTypes: ["ts"],
      policy: createAutomaticLspPathPolicy(tmpDir, []),
    });

    expect(inventory).toEqual({
      status: "complete",
      reason: null,
      observedFileCount: 2,
      files: [path.join(tmpDir, ".github/workflow.ts"), path.join(tmpDir, "src/app.ts")],
    });
  });

  it("reports a limited inventory when the file safety limit is reached", async () => {
    const entries = Array.from({ length: 50_001 }, (_, index) => ({
      name: `source-${index}.ts`,
      isDirectory: () => false,
      isFile: () => true,
      isSymbolicLink: () => false,
    }));
    vi.spyOn(fs.promises, "readdir").mockResolvedValue(entries as never);

    const inventory = await scanWorkspaceSources(tmpDir || "/project", {
      fileTypes: ["ts"],
      policy: { isEligible: () => true, workspaceRoot: tmpDir || "/project" },
    });

    expect(inventory).toEqual({
      status: "limited",
      reason: "file-limit",
      observedFileCount: 50_001,
      files: [],
    });
  });

  it("reports a limited inventory when a directory cannot be read", async () => {
    vi.spyOn(fs.promises, "readdir").mockRejectedValue(new Error("permission denied"));

    await expect(
      scanWorkspaceSources("/project", {
        fileTypes: ["ts"],
        policy: { isEligible: () => true, workspaceRoot: "/project" },
      }),
    ).resolves.toEqual({
      status: "limited",
      reason: "filesystem-error",
      observedFileCount: 0,
      files: [],
    });
  });

  it("stops when the caller signal is aborted during inventory", async () => {
    const controller = new AbortController();
    const entries = Array.from({ length: 4 }, (_, index) => ({
      name: `source-${index}.ts`,
      isDirectory: () => false,
      isFile: () => true,
      isSymbolicLink: () => false,
    }));
    vi.spyOn(fs.promises, "readdir").mockImplementation(async () => entries as never);
    let checks = 0;

    await expect(
      scanWorkspaceSources("/project", {
        fileTypes: ["ts"],
        policy: {
          workspaceRoot: "/project",
          isEligible: () => {
            checks++;
            if (checks === 2) controller.abort(new Error("cancelled scan"));
            return true;
          },
        },
        control: { signal: controller.signal },
      }),
    ).rejects.toThrow("cancelled scan");
  });

  it("stops when the absolute request deadline has elapsed", async () => {
    await expect(
      scanWorkspaceSources("/project", {
        fileTypes: ["ts"],
        policy: { isEligible: () => true, workspaceRoot: "/project" },
        control: { deadline: Date.now() - 1 },
      }),
    ).rejects.toThrow("Code request deadline exceeded");
  });
});
