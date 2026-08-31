import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { commandExists, detectLanguageId } from "../../src/utils.ts";

describe("detectLanguageId", () => {
  it.each([
    ["src/index.ts", "typescript"],
    ["app.tsx", "typescriptreact"],
    ["main.js", "javascript"],
    ["page.jsx", "javascriptreact"],
    ["lib.py", "python"],
    ["main.rs", "rust"],
    ["main.go", "go"],
    ["go.mod", "go.mod"],
    ["app.c", "c"],
    ["app.cpp", "cpp"],
    ["style.css", "css"],
    ["doc.md", "markdown"],
    ["config.yaml", "yaml"],
    ["views/index.html.erb", "erb"],
    ["project.gemspec", "ruby"],
    ["script.sh", "shellscript"],
    ["script.ksh", "shellscript"],
  ])("detects %s as %s", (file, expected) => {
    expect(detectLanguageId(file)).toBe(expected);
  });

  it("returns raw extension for unknown types", () => {
    expect(detectLanguageId("data.xyz")).toBe("xyz");
  });
});

describe("commandExists", () => {
  it("finds node on PATH", () => {
    expect(commandExists("node")).toBe(true);
  });

  it("rejects a directory used as an absolute command", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-command-dir-"));
    try {
      expect(commandExists(directory)).toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform !== "win32")(
    "requires an absolute command file to be executable",
    () => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-command-file-"));
      const command = path.join(directory, "server");
      try {
        fs.writeFileSync(command, "#!/bin/sh\nexit 0\n");
        fs.chmodSync(command, 0o644);
        expect(commandExists(command)).toBe(false);
        fs.chmodSync(command, 0o755);
        expect(commandExists(command)).toBe(true);
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it("returns false for nonexistent command", () => {
    expect(commandExists("definitely-not-a-real-command-xyz")).toBe(false);
  });
});
