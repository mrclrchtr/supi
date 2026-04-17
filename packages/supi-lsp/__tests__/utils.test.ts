import { describe, expect, it } from "vitest";
import {
  commandExists,
  detectLanguageId,
  fileToUri,
  findProjectRoot,
  getFileExtension,
  uriToFile,
} from "../utils.ts";

describe("fileToUri", () => {
  it("converts absolute unix path", () => {
    const uri = fileToUri("/home/user/file.ts");
    expect(uri).toBe("file:///home/user/file.ts");
  });

  it("handles spaces in path", () => {
    const uri = fileToUri("/home/user/my project/file.ts");
    expect(uri).toBe("file:///home/user/my project/file.ts");
  });
});

describe("uriToFile", () => {
  it("converts file URI to path", () => {
    expect(uriToFile("file:///home/user/file.ts")).toBe("/home/user/file.ts");
  });

  it("decodes percent-encoded characters", () => {
    expect(uriToFile("file:///home/user/my%20project/file.ts")).toBe(
      "/home/user/my project/file.ts",
    );
  });

  it("passes through non-file URIs", () => {
    expect(uriToFile("https://example.com")).toBe("https://example.com");
  });
});

describe("detectLanguageId", () => {
  it.each([
    ["src/index.ts", "typescript"],
    ["app.tsx", "typescriptreact"],
    ["main.js", "javascript"],
    ["page.jsx", "javascriptreact"],
    ["lib.py", "python"],
    ["main.rs", "rust"],
    ["main.go", "go"],
    ["app.c", "c"],
    ["app.cpp", "cpp"],
    ["style.css", "css"],
    ["doc.md", "markdown"],
    ["config.yaml", "yaml"],
    ["script.sh", "shellscript"],
  ])("detects %s as %s", (file, expected) => {
    expect(detectLanguageId(file)).toBe(expected);
  });

  it("returns raw extension for unknown types", () => {
    expect(detectLanguageId("data.xyz")).toBe("xyz");
  });
});

describe("getFileExtension", () => {
  it("extracts extension without dot", () => {
    expect(getFileExtension("file.ts")).toBe("ts");
    expect(getFileExtension("path/to/file.py")).toBe("py");
  });

  it("returns empty for no extension", () => {
    expect(getFileExtension("Makefile")).toBe("");
  });
});

describe("findProjectRoot", () => {
  it("finds root by marker", () => {
    // process.cwd() should have package.json
    const root = findProjectRoot(`${process.cwd()}/lsp`, ["package.json"], "/tmp");
    expect(root).toBe(process.cwd());
  });

  it("returns fallback when no marker found", () => {
    const root = findProjectRoot("/tmp", ["nonexistent-marker-file-xyz"], "/fallback");
    expect(root).toBe("/fallback");
  });
});

describe("commandExists", () => {
  it("finds node on PATH", () => {
    expect(commandExists("node")).toBe(true);
  });

  it("returns false for nonexistent command", () => {
    expect(commandExists("definitely-not-a-real-command-xyz")).toBe(false);
  });
});
