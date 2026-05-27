import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeAction } from "../helpers/execute-action.ts";
import { clearMockRuntime, registerMockProvider } from "../helpers/register-mock-runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-actions-"));
});

afterEach(() => {
  clearMockRuntime();
  rmSync(tmpDir, { recursive: true, force: true });
});

// registerMockProvider is now imported from the shared test helper

function writeJson(dir: string, file: string, data: unknown) {
  writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
}

describe("executeAction validation", () => {
  it("rejects unknown action", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
    const result = await executeAction({ action: "unknown" as any }, { cwd: tmpDir });
    expect(result.content).toContain("Error");
    expect(result.content).toContain("Unknown action");
    expect(result.content).toContain("brief");
  });

  it("rejects line/character with path instead of file", async () => {
    const result = await executeAction(
      { action: "references", path: "src/", line: 1, character: 1 },
      { cwd: tmpDir },
    );
    expect(result.content).toContain("Error");
    expect(result.content).toContain("require `file`");
  });

  it("rejects line/character without file", async () => {
    const result = await executeAction(
      { action: "references", line: 1, character: 1 },
      { cwd: tmpDir },
    );
    expect(result.content).toContain("Error");
    expect(result.content).toContain("require `file`");
  });

  it("rejects file pointing to directory", async () => {
    const subDir = path.join(tmpDir, "sub");
    mkdirSync(subDir);
    const result = await executeAction({ action: "references", file: "sub" }, { cwd: tmpDir });
    expect(result.content).toContain("Error");
    expect(result.content).toContain("directory");
  });

  it("rejects semantic action without file or symbol", async () => {
    const result = await executeAction({ action: "references" }, { cwd: tmpDir });
    expect(result.content).toContain("Error");
    expect(result.content).toContain("anchored coordinates");
  });

  it("rejects pattern action without pattern param", async () => {
    const result = await executeAction({ action: "pattern" }, { cwd: tmpDir });
    expect(result.content).toContain("Error");
    expect(result.content).toContain("pattern");
  });

  it("supports file-only references for exported file surfaces", async () => {
    writeFileSync(path.join(tmpDir, "test.ts"), "export const x = 1;");
    registerMockProvider(tmpDir, {
      documentSymbols: async () => [
        { name: "x", kind: "Variable", file: "", line: 1, character: 14 },
      ],
      exports: async (_file) => ({
        kind: "success" as const,
        data: [
          {
            name: "x",
            kind: "const",
            startLine: 1,
            startCharacter: 14,
            endLine: 1,
            endCharacter: 25,
            moduleSpecifier: undefined,
          },
        ],
      }),
    });
    const result = await executeAction({ action: "references", file: "test.ts" }, { cwd: tmpDir });
    expect(result.content).toContain("References of `test.ts");
    expect(result.content).not.toContain("Error");
  });
});

describe("brief action", () => {
  it("returns project brief for no-path call", async () => {
    writeJson(tmpDir, "package.json", { name: "test-proj", description: "Test" });
    const result = await executeAction({ action: "brief" }, { cwd: tmpDir });
    expect(result.content).toContain("Project Brief");
    expect(result.content).toContain("test-proj");
  });

  it("returns error for non-existent path", async () => {
    writeJson(tmpDir, "package.json", { name: "test" });
    const result = await executeAction({ action: "brief", path: "nonexistent/" }, { cwd: tmpDir });
    expect(result.content).toContain("Error");
    expect(result.content).toContain("not found");
  });

  it("returns no-structure message for empty dir", async () => {
    const result = await executeAction({ action: "brief" }, { cwd: tmpDir });
    expect(result.content).toContain("No project structure");
  });
});

describe("affected action", () => {
  it("keeps unavailable confidence for affected symbol requests without semantic support", async () => {
    const result = await executeAction({ action: "affected", symbol: "Widget" }, { cwd: tmpDir });
    expect(result.details?.type).toBe("affected");
    if (result.details?.type === "affected") {
      expect(result.details.data.confidence).toBe("unavailable");
    }
    expect(result.content).not.toContain("heuristic");
  });
});

describe("pattern action", () => {
  it("finds matches in files", async () => {
    writeJson(tmpDir, "package.json", { name: "test" });
    writeFileSync(path.join(tmpDir, "index.ts"), "export const hello = 'world';");
    writeFileSync(path.join(tmpDir, "other.ts"), "import { hello } from './index';");

    const result = await executeAction({ action: "pattern", pattern: "hello" }, { cwd: tmpDir });
    expect(result.content).toContain("Pattern:");
    expect(result.content).toContain("hello");
    expect(result.content).toContain("match");
  });

  it("returns no-matches message", async () => {
    writeJson(tmpDir, "package.json", { name: "test" });
    writeFileSync(path.join(tmpDir, "index.ts"), "export const x = 1;");

    const result = await executeAction(
      { action: "pattern", pattern: "nonexistent_symbol_xyz" },
      { cwd: tmpDir },
    );
    expect(result.content).toContain("No matches");
  });

  it("respects path scoping", async () => {
    writeJson(tmpDir, "package.json", { name: "test" });
    const subDir = path.join(tmpDir, "src");
    mkdirSync(subDir);
    writeFileSync(path.join(subDir, "a.ts"), "export const target = 1;");
    writeFileSync(path.join(tmpDir, "b.ts"), "export const target = 2;");

    const result = await executeAction(
      { action: "pattern", pattern: "target", path: "src/" },
      { cwd: tmpDir },
    );
    expect(result.content).toContain("src/");
    expect(result.content).toContain("target");
  });

  it("treats regex metacharacters literally by default", async () => {
    writeJson(tmpDir, "package.json", { name: "test" });
    writeFileSync(path.join(tmpDir, "index.ts"), "const x = sendMessage({ ok: true });");

    const result = await executeAction(
      { action: "pattern", pattern: "sendMessage({" },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("sendMessage({");
    expect(result.content).not.toContain("No matches");
  });

  it("supports opt-in regex pattern searches", async () => {
    writeJson(tmpDir, "package.json", { name: "test" });
    writeFileSync(
      path.join(tmpDir, "index.ts"),
      ["export const registerSettings = 1;", "export const registerConfig = 2;"].join("\n"),
    );

    const result = await executeAction(
      { action: "pattern", pattern: "register(Settings|Config)", regex: true },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("registerSettings");
    expect(result.content).toContain("registerConfig");
  });

  it("returns an explicit error for malformed regex patterns", async () => {
    writeJson(tmpDir, "package.json", { name: "test" });
    writeFileSync(path.join(tmpDir, "index.ts"), "const x = sendMessage({ ok: true });");

    const result = await executeAction(
      { action: "pattern", pattern: "sendMessage(", regex: true },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("**Error:** Invalid regex pattern");
    expect(result.content).toContain("sendMessage(");
    expect(result.content).not.toContain("No matches");
  });
});
