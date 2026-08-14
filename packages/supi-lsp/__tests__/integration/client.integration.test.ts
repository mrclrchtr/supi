// Integration tests — spawn real LSP servers against temp projects.
// Require typescript-language-server on PATH and typescript in workspace node_modules.
// Skip with: pnpm test -- --testPathIgnorePatterns integration

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CodeQueryResult } from "@mrclrchtr/supi-code-runtime/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LspClient } from "../../src/client/client.ts";
import type { Diagnostic, ServerConfig } from "../../src/config/types.ts";
import { createLspSemanticProvider } from "../../src/provider/lsp-semantic-provider.ts";
import type { WorkspaceLspRuntime } from "../../src/session/runtime-registry.ts";
import { hasCommand, waitFor } from "../helpers/integration-utils.ts";

// typescript-language-server resolves tsserver from the project root's
// node_modules. The test's temp project has no node_modules, so we pass
// tsserver.path explicitly via initialization options.
const TSSERVER = path.resolve(
  import.meta.dirname,
  "../../../../node_modules/typescript/lib/tsserver.js",
);

function queryData<T>(result: CodeQueryResult<T>): T | null {
  return result.kind === "unavailable" ? null : result.data;
}

function completedDiagnostics(result: CodeQueryResult<Diagnostic[]>): Diagnostic[] {
  expect(result.kind).toBe("completed");
  if (result.kind !== "completed") {
    throw new Error(`Expected completed diagnostics, got ${result.kind}.`);
  }
  return result.data;
}

const TS_SERVER_CONFIG: ServerConfig = {
  command: "typescript-language-server",
  args: ["--stdio"],
  fileTypes: ["ts"],
  rootMarkers: ["tsconfig.json", "package.json"],
  initializationOptions: { tsserver: { path: TSSERVER } },
};

// ── Fixture Setup ─────────────────────────────────────────────────────

let tmpDir: string;
let goodFile: string;
let badFile: string;
let overloadFile: string;

const HAS_TS_LSP = hasCommand("typescript-language-server") && fs.existsSync(TSSERVER);

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-integration-"));

  // Minimal tsconfig
  fs.writeFileSync(
    path.join(tmpDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, target: "ES2022", module: "ESNext" },
      include: ["*.ts"],
    }),
  );

  // A valid TS file
  goodFile = path.join(tmpDir, "good.ts");
  fs.writeFileSync(
    goodFile,
    "export function add(a: number, b: number): number {\n  return a + b;\n}\n",
  );

  // A file with a type error
  badFile = path.join(tmpDir, "bad.ts");
  fs.writeFileSync(badFile, 'export const x: number = "not a number";\n');

  overloadFile = path.join(tmpDir, "overload.ts");
  fs.writeFileSync(
    overloadFile,
    [
      "export function liveOverload(value: string): string;",
      "export function liveOverload(value: number): number;",
      "export function liveOverload(value: string | number): string | number {",
      "  return value;",
      "}",
      "",
    ].join("\n"),
  );
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Tests ─────────────────────────────────────────────────────────────

describe.skipIf(!HAS_TS_LSP)("LspClient integration (typescript-language-server)", () => {
  let client: LspClient;

  afterAll(async () => {
    if (client?.status === "running") {
      await client.shutdown();
    }
  });

  it("starts and initializes successfully", async () => {
    client = new LspClient("typescript-language-server", TS_SERVER_CONFIG, tmpDir);
    await client.start();
    expect(client.status).toBe("running");

    // Readiness: server should become ready within the 2s no-progress
    // window (small project, tsserver finishes indexing quickly).
    await client.getReady();
    expect(client.ready).toBe(true);
  }, 15_000);

  it("opens a document and tracks it", () => {
    const content = fs.readFileSync(goodFile, "utf-8");
    client.didOpen(goodFile, content);
    expect(client.openFiles).toContain(goodFile);
  });

  it("returns hover information", async () => {
    const hover = await client.hover(goodFile, { line: 0, character: 16 });
    expect(hover).not.toBeNull();
    // Should contain "add" function signature
    const text = JSON.stringify(hover);
    expect(text).toContain("add");
  }, 10_000);

  it("returns definition location", async () => {
    // Write a file that references something
    const refFile = path.join(tmpDir, "ref.ts");
    fs.writeFileSync(refFile, 'import { add } from "./good";\nconst result = add(1, 2);\n');
    client.didOpen(refFile, fs.readFileSync(refFile, "utf-8"));

    // Wait for the language server to answer a real definition request instead
    // of sleeping a fixed amount of time. LSP definition returns null, a single
    // Location, or an array of Locations — we need a non-null, non-empty array
    // response to be sure indexing has completed.
    const def = await waitFor(
      () => client.definition(refFile, { line: 1, character: 15 }),
      (definition) => {
        const data = queryData(definition);
        return data !== null && (!Array.isArray(data) || data.length > 0);
      },
      { timeoutMs: 5_000, retryDelayMs: 100, label: "definition of 'add' in ref.ts" },
    );
    expect(def).not.toBeNull();
  }, 10_000);

  it("returns document symbols", async () => {
    const symbols = await client.documentSymbols(goodFile);
    const data = queryData(symbols);
    expect(data).not.toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data?.length).toBeGreaterThan(0);

    // Should find the "add" function
    const text = JSON.stringify(data);
    expect(text).toContain("add");
  }, 10_000);

  it("collects diagnostics for file with type error", async () => {
    const content = fs.readFileSync(badFile, "utf-8");
    const result = await waitFor(
      () => client.syncAndWaitForDiagnostics(badFile, content),
      (diagnostics) => diagnostics.kind !== "unavailable" && diagnostics.data.length > 0,
      { timeoutMs: 10_000, retryDelayMs: 200, label: "diagnostics for bad.ts" },
    );
    const diagnostics = completedDiagnostics(result);
    expect(diagnostics.length).toBeGreaterThan(0);
    // Should report a type error
    const hasError = diagnostics.some((d: Diagnostic) => d.severity === 1);
    expect(hasError).toBe(true);
  }, 15_000);

  it("reuses current clean evidence for an unchanged file", async () => {
    const content = fs.readFileSync(goodFile, "utf-8");
    const result = await client.syncAndWaitForDiagnostics(goodFile, content);

    expect(result).toEqual({ kind: "completed", data: [] });
  }, 10_000);

  it("confirms fresh diagnostics after fixing a push-only file", async () => {
    // First sync bad content
    const badContent = 'export const y: number = "wrong";\n';
    const fixFile = path.join(tmpDir, "fixme.ts");
    fs.writeFileSync(fixFile, badContent);
    const beforeResult = await client.syncAndWaitForDiagnostics(fixFile, badContent);
    const errorsBefore = completedDiagnostics(beforeResult).filter(
      (d: Diagnostic) => d.severity === 1,
    );
    expect(errorsBefore.length).toBeGreaterThan(0);

    // Now fix it: the unversioned push after the sync moment confirms the
    // clean result (or the reopen-resync fallback does), so the fresh
    // evidence is completed, never partial.
    const goodContent = "export const y: number = 42;\n";
    fs.writeFileSync(fixFile, goodContent);
    const afterResult = await client.syncAndWaitForDiagnostics(fixFile, goodContent);
    expect(afterResult.kind).toBe("completed");
    if (afterResult.kind === "completed") expect(afterResult.data).toEqual([]);
  }, 15_000);

  it("returns code actions for diagnostic", async () => {
    const content = fs.readFileSync(badFile, "utf-8");
    await client.syncAndWaitForDiagnostics(badFile, content);

    const diags = client.getDiagnostics(badFile);
    const actions = await client.codeActions(
      badFile,
      { start: { line: 0, character: 0 }, end: { line: 0, character: 40 } },
      { diagnostics: diags },
    );
    // May or may not have actions — just verify no crash
    expect(actions === null || Array.isArray(actions)).toBe(true);
  }, 10_000);

  it("returns workspace symbols for exact match", async () => {
    const symbols = await client.workspaceSymbol("add");
    const data = queryData(symbols);
    expect(data).not.toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data?.length).toBeGreaterThan(0);
    const text = JSON.stringify(data);
    expect(text).toContain("add");
  }, 10_000);

  it("returns workspace symbols for partial query", async () => {
    const symbols = await client.workspaceSymbol("Cal");
    const data = queryData(symbols);
    expect(data).not.toBeNull();
    expect(Array.isArray(data)).toBe(true);
    // Server-dependent: some LSP servers only support exact/prefix matching
  }, 10_000);

  it("closes a document and removes from tracking", () => {
    client.didClose(goodFile);
    expect(client.openFiles).not.toContain(goodFile);
  });

  it("returns unavailable when workspace symbol provider is not supported", async () => {
    const unsupportedClient = new LspClient("none", TS_SERVER_CONFIG, tmpDir);
    const symbols = await unsupportedClient.workspaceSymbol("add");
    expect(symbols.kind).toBe("unavailable");
  });

  // ADR 0003 — the real LSP must produce CodeSymbols with nameAnchor
  // (identifier offset) distinct from declarationAnchor (export keyword).
  // Mocked-provider unit tests asserted shapes they fed in; this test
  // validates the actual flattenDocumentSymbols → selectionRange path.
  it("semantic provider populates nameAnchor from DocumentSymbol.selectionRange (ADR 0003)", async () => {
    // Re-open after the "closes a document" test above.
    client.didOpen(goodFile, fs.readFileSync(goodFile, "utf-8"));

    const semantic = createLspSemanticProvider(client as unknown as WorkspaceLspRuntime);
    const symbols = await semantic.documentSymbols(goodFile);
    const data = queryData(symbols);
    expect(data).not.toBeNull();
    expect(data?.length).toBeGreaterThan(0);

    const addFn = data?.find((symbol) => symbol.name === "add");
    expect(addFn).toBeDefined();
    // Declaration anchor: the `export` keyword (col 1).
    expect(addFn?.declarationAnchor.character).toBe(1);
    // Name anchor: the identifier `add` (~col 17), NOT the export keyword.
    expect(addFn?.nameAnchor).toBeDefined();
    if (addFn?.nameAnchor) {
      expect(addFn.nameAnchor.character).toBeGreaterThan(1);
    }
  }, 10_000);

  it("repairs declaration-wide overload selection ranges to identifier anchors", async () => {
    client.didOpen(overloadFile, fs.readFileSync(overloadFile, "utf-8"));

    const semantic = createLspSemanticProvider(client as unknown as WorkspaceLspRuntime);
    const symbols = await semantic.documentSymbols(overloadFile);
    const overloads = queryData(symbols)?.filter((symbol) => symbol.name === "liveOverload") ?? [];

    expect(overloads).toHaveLength(3);
    expect(overloads.map((symbol) => symbol.nameAnchor?.character)).toEqual([17, 17, 17]);
  }, 10_000);

  it("shuts down cleanly", async () => {
    await client.shutdown();
    expect(client.status).toBe("shutdown");
  }, 10_000);
});
