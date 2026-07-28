import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createPiMock, getHandlerOrThrow, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../../../src/extension.ts";
import { clearMockRuntime } from "../../../helpers/register-mock-runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-orientation-instructions-"));
  writeJson("package.json", { name: "ctx-ws" });
});

afterEach(() => {
  clearMockRuntime();
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeJson(relPath: string, data: unknown): void {
  writeFile(relPath, JSON.stringify(data, null, 2));
}

function writeFile(relPath: string, content: string): void {
  const absPath = path.join(tmpDir, relPath);
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, content);
}

async function orientDirectory(
  pi: ReturnType<typeof createPiMock>,
  focus: string,
  options: { projectTrusted?: boolean } = {},
): Promise<{ text: string; details?: { data?: Record<string, unknown> } }> {
  const tool = getTool(pi, "code_orientation");
  const result = (await tool.execute(
    "orientation-instructions",
    { focus: { path: focus } },
    undefined,
    undefined,
    makeCtx({
      cwd: tmpDir,
      isProjectTrusted: () => options.projectTrusted ?? true,
    }),
  )) as { content: Array<{ text: string }>; details?: { data?: Record<string, unknown> } };
  return { text: result.content[0]?.text ?? "", details: result.details };
}

describe("code_orientation instruction files", () => {
  it("surfaces instruction files for directory focus near the top", async () => {
    writeJson("packages/foo/package.json", { name: "foo" });
    writeFile("packages/foo/src/index.ts", "export const foo = 1;\n");
    writeFile("packages/foo/CLAUDE.md", "# Foo instructions\n\n- Follow foo rules.\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const result = await orientDirectory(pi, "packages/foo");

    expect(result.text).toContain("## Instructions");
    expect(result.text).toContain("### packages/foo/CLAUDE.md");
    expect(result.text).toContain("Follow foo rules");
    expect(result.text.indexOf("## Instructions")).toBeLessThan(
      result.text.indexOf("## Direct regular files"),
    );
    expect(result.details?.data?.instructions).toMatchObject({
      files: [
        {
          path: "packages/foo/CLAUDE.md",
          directory: "packages/foo",
          shownLines: 3,
          totalLines: 3,
          truncated: false,
        },
      ],
    });
  });

  it("walks upward from cwd to focus and renders deepest instructions last", async () => {
    writeFile("packages/CLAUDE.md", "# Packages\n");
    writeJson("packages/foo/package.json", { name: "foo" });
    writeFile("packages/foo/CLAUDE.md", "# Foo\n");
    writeFile("packages/foo/src/CLAUDE.md", "# Source\n");
    writeFile("packages/foo/src/index.ts", "export const foo = 1;\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const result = await orientDirectory(pi, "packages/foo/src");

    const packagesIndex = result.text.indexOf("### packages/CLAUDE.md");
    const fooIndex = result.text.indexOf("### packages/foo/CLAUDE.md");
    const srcIndex = result.text.indexOf("### packages/foo/src/CLAUDE.md");
    expect(packagesIndex).toBeGreaterThanOrEqual(0);
    expect(fooIndex).toBeGreaterThan(packagesIndex);
    expect(srcIndex).toBeGreaterThan(fooIndex);
  });

  it("uses the first configured instruction file per directory", async () => {
    writeJson("packages/foo/package.json", { name: "foo" });
    writeFile("packages/foo/src/index.ts", "export const foo = 1;\n");
    writeFile("packages/foo/CLAUDE.md", "# Claude\n");
    writeFile("packages/foo/AGENTS.md", "# Agents\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const result = await orientDirectory(pi, "packages/foo");

    expect(result.text).toContain("# Claude");
    expect(result.text).not.toContain("# Agents");
  });

  it("respects code-intelligence.instructionFileNames", async () => {
    writeJson(".pi/supi/config.json", {
      "code-intelligence": { instructionFileNames: ["RULES.md"] },
    });
    writeJson("packages/foo/package.json", { name: "foo" });
    writeFile("packages/foo/src/index.ts", "export const foo = 1;\n");
    writeFile("packages/foo/CLAUDE.md", "# Claude\n");
    writeFile("packages/foo/RULES.md", "# Rules\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const result = await orientDirectory(pi, "packages/foo");

    expect(result.text).toContain("### packages/foo/RULES.md");
    expect(result.text).toContain("# Rules");
    expect(result.text).not.toContain("# Claude");
  });

  it("rejects configured instruction names with directory components", async () => {
    writeJson(".pi/supi/config.json", {
      "code-intelligence": { instructionFileNames: ["../RULES.md"] },
    });
    writeFile("packages/RULES.md", "# Parent rules\n");
    writeJson("packages/foo/package.json", { name: "foo" });
    writeFile("packages/foo/src/index.ts", "export const foo = 1;\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const result = await orientDirectory(pi, "packages/foo");
    expect(result.text).not.toContain("## Instructions");
    expect(result.text).not.toContain("Parent rules");
  });

  it("ignores non-string configured instruction names", async () => {
    writeJson(".pi/supi/config.json", {
      "code-intelligence": { instructionFileNames: [null, 42, "CLAUDE.md"] },
    });
    writeJson("packages/foo/package.json", { name: "foo" });
    writeFile("packages/foo/src/index.ts", "export const foo = 1;\n");
    writeFile("packages/foo/CLAUDE.md", "# Valid rules\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const result = await orientDirectory(pi, "packages/foo");
    expect(result.text).toContain("Valid rules");
  });

  it("rejects instruction symlinks whose real path leaves the workspace", async () => {
    const externalDir = mkdtempSync(path.join(os.tmpdir(), "external-instructions-"));
    const externalFile = path.join(externalDir, "CLAUDE.md");
    writeFileSync(externalFile, "# External secret\n");
    writeJson("packages/foo/package.json", { name: "foo" });
    writeFile("packages/foo/src/index.ts", "export const foo = 1;\n");
    symlinkSync(externalFile, path.join(tmpDir, "packages/foo/CLAUDE.md"));

    try {
      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);

      const result = await orientDirectory(pi, "packages/foo");
      expect(result.text).not.toContain("## Instructions");
      expect(result.text).not.toContain("External secret");
    } finally {
      rmSync(externalDir, { recursive: true, force: true });
    }
  });

  it("accepts instruction symlinks whose real path remains in the workspace", async () => {
    writeFile("shared/CLAUDE.md", "# Shared workspace rules\n");
    writeJson("packages/foo/package.json", { name: "foo" });
    writeFile("packages/foo/src/index.ts", "export const foo = 1;\n");
    symlinkSync(path.join(tmpDir, "shared/CLAUDE.md"), path.join(tmpDir, "packages/foo/CLAUDE.md"));

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const result = await orientDirectory(pi, "packages/foo");
    expect(result.text).toContain("### packages/foo/CLAUDE.md");
    expect(result.text).toContain("Shared workspace rules");
  });

  it("rejects focused directory symlinks whose real path leaves the workspace", async () => {
    const externalDir = mkdtempSync(path.join(os.tmpdir(), "external-focus-"));
    writeFile("shared/CLAUDE.md", "# Bounced workspace rules\n");
    symlinkSync(path.join(tmpDir, "shared/CLAUDE.md"), path.join(externalDir, "CLAUDE.md"));
    mkdirSync(path.join(tmpDir, "packages"), { recursive: true });
    symlinkSync(externalDir, path.join(tmpDir, "packages/external"), "dir");

    try {
      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);

      const result = await orientDirectory(pi, "packages/external");
      expect(result.text).not.toContain("## Instructions");
      expect(result.text).not.toContain("Bounced workspace rules");
    } finally {
      rmSync(externalDir, { recursive: true, force: true });
    }
  });

  it("does not discover project instruction files before trust is granted", async () => {
    writeJson("packages/foo/package.json", { name: "foo" });
    writeFile("packages/foo/src/index.ts", "export const foo = 1;\n");
    writeFile("packages/foo/CLAUDE.md", "# Untrusted project instructions\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const untrusted = await orientDirectory(pi, "packages/foo", { projectTrusted: false });
    expect(untrusted.text).not.toContain("## Instructions");
    expect(untrusted.text).not.toContain("Untrusted project instructions");

    const trusted = await orientDirectory(pi, "packages/foo", { projectTrusted: true });
    expect(trusted.text).toContain("## Instructions");
    expect(trusted.text).toContain("Untrusted project instructions");

    await pi.emit("session_compact", {}, makeCtx({ cwd: tmpDir }));
    const untrustedAgain = await orientDirectory(pi, "packages/foo", { projectTrusted: false });
    expect(untrustedAgain.text).not.toContain("## Instructions");
  });
});

describe("code_orientation instruction-file limits and deduplication", () => {
  it("does not surface instruction files for file focus", async () => {
    writeJson("packages/foo/package.json", { name: "foo" });
    writeFile("packages/foo/src/index.ts", "export const foo = 1;\n");
    writeFile("packages/foo/CLAUDE.md", "# Foo instructions\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const result = await orientDirectory(pi, "packages/foo/src/index.ts");

    expect(result.text).not.toContain("## Instructions");
    expect(result.details?.data?.instructions).toBeUndefined();
  });

  it("truncates each instruction file to 200 lines", async () => {
    writeJson("packages/foo/package.json", { name: "foo" });
    writeFile("packages/foo/src/index.ts", "export const foo = 1;\n");
    const lines = Array.from({ length: 205 }, (_, index) => `line ${index + 1}`);
    writeFile("packages/foo/CLAUDE.md", lines.join("\n"));

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const result = await orientDirectory(pi, "packages/foo");

    expect(result.text).toContain("line 200");
    expect(result.text).not.toContain("line 201");
    expect(result.text).toContain("truncated to 200 of 205 lines");
    expect(result.details?.data?.instructions).toMatchObject({
      files: [{ shownLines: 200, totalLines: 205, truncated: true }],
    });
  });

  it("skips native-loaded context paths", async () => {
    writeJson("packages/foo/package.json", { name: "foo" });
    writeFile("packages/foo/src/index.ts", "export const foo = 1;\n");
    const nativePath = path.join(tmpDir, "packages/foo/CLAUDE.md");
    writeFile("packages/foo/CLAUDE.md", "# Native\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    await pi.emit(
      "before_agent_start",
      { systemPromptOptions: { contextFiles: [{ path: nativePath, content: "# Native" }] } },
      makeCtx({ cwd: tmpDir }),
    );

    const result = await orientDirectory(pi, "packages/foo");

    expect(result.text).not.toContain("## Instructions");
  });

  it("deduplicates surfaced directories until compaction", async () => {
    writeJson("packages/foo/package.json", { name: "foo" });
    writeFile("packages/foo/src/index.ts", "export const foo = 1;\n");
    writeFile("packages/foo/CLAUDE.md", "# Foo\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    expect((await orientDirectory(pi, "packages/foo")).text).toContain("## Instructions");
    expect((await orientDirectory(pi, "packages/foo")).text).not.toContain("## Instructions");

    await pi.emit("session_compact", {}, makeCtx({ cwd: tmpDir }));

    expect((await orientDirectory(pi, "packages/foo")).text).toContain("## Instructions");
  });
});

describe("code_orientation instruction-file reconstruction", () => {
  it("reconstructs surfaced directories from code_orientation details", async () => {
    writeJson("packages/foo/package.json", { name: "foo" });
    writeFile("packages/foo/src/index.ts", "export const foo = 1;\n");
    writeFile("packages/foo/CLAUDE.md", "# Foo\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const sessionStart = getHandlerOrThrow(pi, "session_start");
    await sessionStart(
      {},
      makeCtx({
        cwd: tmpDir,
        sessionManager: { getBranch: () => [orientationResultEntry("packages/foo")] },
      }),
    );

    expect((await orientDirectory(pi, "packages/foo")).text).not.toContain("## Instructions");
  });

  it("ignores instruction details before the latest compaction", async () => {
    writeJson("packages/foo/package.json", { name: "foo" });
    writeFile("packages/foo/src/index.ts", "export const foo = 1;\n");
    writeFile("packages/foo/CLAUDE.md", "# Foo\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const sessionStart = getHandlerOrThrow(pi, "session_start");
    await sessionStart(
      {},
      makeCtx({
        cwd: tmpDir,
        sessionManager: {
          getBranch: () => [orientationResultEntry("packages/foo"), { type: "compaction" }],
        },
      }),
    );

    expect((await orientDirectory(pi, "packages/foo")).text).toContain("## Instructions");
  });
});

function orientationResultEntry(directory: string) {
  return {
    type: "message",
    message: {
      role: "toolResult",
      toolName: "code_orientation",
      details: {
        type: "context",
        data: {
          instructions: {
            files: [{ directory }],
          },
        },
      },
    },
  };
}
