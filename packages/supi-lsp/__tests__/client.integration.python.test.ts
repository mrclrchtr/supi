// Integration tests — LspClient against pyright-langserver for real Python LSP.
// Requires pyright-langserver on PATH.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LspClient } from "../src/client/client.ts";
import type { Diagnostic, ServerConfig } from "../src/types.ts";
import { hasCommand, waitFor } from "./integration-utils.ts";

const PY_SERVER_CONFIG: ServerConfig = {
  command: "pyright-langserver",
  args: ["--stdio"],
  fileTypes: ["py", "pyi"],
  rootMarkers: ["pyrightconfig.json", "pyproject.toml", "requirements.txt"],
};

const HAS_PYRIGHT = hasCommand("pyright-langserver");

// ── Fixture Setup ─────────────────────────────────────────────────────

let tmpDir: string;
let goodFile: string;
let badFile: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-py-integration-"));

  // Pyright requires at least a config or project marker to start properly.
  // An empty pyrightconfig.json is enough.
  fs.writeFileSync(path.join(tmpDir, "pyrightconfig.json"), JSON.stringify({}));

  // A valid Python file with type annotations
  goodFile = path.join(tmpDir, "calc.py");
  fs.writeFileSync(
    goodFile,
    [
      "def add(a: int, b: int) -> int:",
      "    return a + b",
      "",
      "",
      "def greet(name: str) -> str:",
      '    return f"Hello, {name}"',
      "",
      "",
      "class Calculator:",
      "    def sum(self, a: int, b: int) -> int:",
      "        return add(a, b)",
      "",
    ].join("\n"),
  );

  // A file with type errors
  badFile = path.join(tmpDir, "errors.py");
  fs.writeFileSync(
    badFile,
    ["from typing import Optional", "", 'x: int = "not a number"', "y: Optional[str] = 42"].join(
      "\n",
    ),
  );
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Tests ─────────────────────────────────────────────────────────────

describe.skipIf(!HAS_PYRIGHT)("LspClient integration (pyright-langserver)", () => {
  let client: LspClient;

  afterAll(async () => {
    if (client?.status === "running") {
      await client.shutdown();
    }
  });

  it("starts and initializes successfully", async () => {
    client = new LspClient("pyright-langserver", PY_SERVER_CONFIG, tmpDir);
    await client.start();
    expect(client.status).toBe("running");
  }, 15_000);

  it("opens a document and tracks it", () => {
    const content = fs.readFileSync(goodFile, "utf-8");
    client.didOpen(goodFile, content);
    expect(client.openFiles).toContain(goodFile);
  });

  it("returns hover information for a function", async () => {
    // Position (0, 5) is middle of "add" on line: "def add(a: int, ...)"
    const hover = await client.hover(goodFile, { line: 0, character: 5 });
    expect(hover).not.toBeNull();
    const text = JSON.stringify(hover);
    expect(text).toContain("add");
    expect(text).toContain("int");
  }, 10_000);

  it("returns hover information for a parameter", async () => {
    const hover = await client.hover(goodFile, { line: 0, character: 13 });
    expect(hover).not.toBeNull();
    const text = JSON.stringify(hover);
    expect(text).toContain("a");
  }, 10_000);

  it("returns no hover for empty position", async () => {
    const hover = await client.hover(goodFile, { line: 2, character: 0 });
    expect(hover).toBeNull();
  }, 10_000);

  it("returns definition location", async () => {
    // "add" is called inside Calculator.sum on line 10, character ~15
    const def = await waitFor(
      () => client.definition(goodFile, { line: 10, character: 15 }),
      (definition) => definition !== null,
      { timeoutMs: 5_000, retryDelayMs: 100, label: "definition of 'add' in calc.py" },
    );
    expect(def).not.toBeNull();
  }, 10_000);

  it("returns document symbols", async () => {
    const symbols = await client.documentSymbols(goodFile);
    expect(symbols).not.toBeNull();
    expect(Array.isArray(symbols)).toBe(true);
    expect(symbols?.length).toBeGreaterThan(0);

    const text = JSON.stringify(symbols);
    expect(text).toContain("add");
    expect(text).toContain("greet");
    expect(text).toContain("Calculator");
  }, 10_000);

  it("collects diagnostics for file with type errors", async () => {
    const content = fs.readFileSync(badFile, "utf-8");
    const diagnostics = await waitFor(
      () => client.syncAndWaitForDiagnostics(badFile, content),
      (items: Diagnostic[]) => items.length > 0,
      { timeoutMs: 10_000, retryDelayMs: 200, label: "diagnostics for errors.py" },
    );
    expect(diagnostics.length).toBeGreaterThan(0);

    // Should report type errors (severity === 1)
    const typeErrors = diagnostics.filter((d: Diagnostic) => d.severity === 1);
    expect(typeErrors.length).toBeGreaterThan(0);
  }, 15_000);

  it("returns no errors for valid file", async () => {
    const content = fs.readFileSync(goodFile, "utf-8");
    const diagnostics = await client.syncAndWaitForDiagnostics(goodFile, content);
    const errors = diagnostics.filter((d: Diagnostic) => d.severity === 1);
    expect(errors).toHaveLength(0);
  }, 10_000);

  it("updates diagnostics after fixing errors", async () => {
    // First sync bad content
    const fixFile = path.join(tmpDir, "fixme.py");
    const badContent = 'y: int = "string"\n';
    fs.writeFileSync(fixFile, badContent);
    const diagsBefore = await client.syncAndWaitForDiagnostics(fixFile, badContent);
    const errorsBefore = diagsBefore.filter((d: Diagnostic) => d.severity === 1);
    expect(errorsBefore.length).toBeGreaterThan(0);

    // Now fix it
    const goodContent = "y: int = 42\n";
    fs.writeFileSync(fixFile, goodContent);
    const diagsAfter = await client.syncAndWaitForDiagnostics(fixFile, goodContent);
    const errorsAfter = diagsAfter.filter((d: Diagnostic) => d.severity === 1);
    expect(errorsAfter).toHaveLength(0);
  }, 15_000);

  it("returns workspace symbols", async () => {
    const symbols = await client.workspaceSymbol("add");
    expect(symbols).not.toBeNull();
    expect(Array.isArray(symbols)).toBe(true);
    if (symbols && symbols.length > 0) {
      const text = JSON.stringify(symbols);
      expect(text).toContain("add");
    }
  }, 10_000);

  it("closes a document and removes from tracking", () => {
    client.didClose(goodFile);
    expect(client.openFiles).not.toContain(goodFile);
  });

  it("shuts down cleanly", async () => {
    await client.shutdown();
    expect(client.status).toBe("shutdown");
  }, 10_000);
});

describe.skipIf(!HAS_PYRIGHT)("LspClient python shutdown-after-error", () => {
  it("shuts down cleanly after sync on a diagnostic-heavy file", async () => {
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-py-shutdown-"));
    fs.writeFileSync(path.join(tmpDir2, "pyrightconfig.json"), JSON.stringify({}));

    const errorFile = path.join(tmpDir2, "err.py");
    fs.writeFileSync(errorFile, 'x: int = "bad"\ny: str = 99\n');

    const shutdownClient = new LspClient("pyright", PY_SERVER_CONFIG, tmpDir2);
    await shutdownClient.start();
    const content = fs.readFileSync(errorFile, "utf-8");
    const diags = await waitFor(
      () => shutdownClient.syncAndWaitForDiagnostics(errorFile, content),
      (items: Diagnostic[]) => items.length > 0,
      { timeoutMs: 10_000, retryDelayMs: 200, label: "shutdown diagnostics for err.py" },
    );

    // Verify diagnostics were collected and shutdown works
    expect(diags.length).toBeGreaterThan(0);

    await shutdownClient.shutdown();
    expect(shutdownClient.status).toBe("shutdown");
    fs.rmSync(tmpDir2, { recursive: true, force: true });
  }, 15_000);
});
