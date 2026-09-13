import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  normalizeTypeScriptDiagnostic,
  normalizeTypeScriptDiagnostics,
} from "../../src/client/client-diagnostic-typescript.ts";
import {
  createRunningTestClient,
  createTypeScriptTestClient,
} from "../helpers/client-test-harness.ts";

const directories: string[] = [];

function createFile(name = "main.ts"): { tmpDir: string; filePath: string; uri: string } {
  const directory = mkdtempSync(join(tmpdir(), "supi-ts-diagnostics-"));
  directories.push(directory);
  const filePath = join(directory, name);
  writeFileSync(filePath, "const value = 1;\n");
  return { tmpDir: directory, filePath, uri: `file://${filePath}` };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("TypeScript diagnostic request adapter", () => {
  it("collects syntax, semantic, and suggestion phases in order", async () => {
    const file = createFile();
    const { client, rpc } = createTypeScriptTestClient({ root: file.filePath, cwd: file.filePath });
    const relatedFile = join(file.filePath, "declaration.ts");
    const phases: Record<string, unknown[]> = {
      syntacticDiagnosticsSync: [
        {
          message: "syntax warning",
          start: 0,
          length: 1,
          startLocation: { line: 1, offset: 1 },
          endLocation: { line: 1, offset: 2 },
          category: "warning",
          code: 100,
        },
      ],
      semanticDiagnosticsSync: [
        {
          message: "type error",
          start: 6,
          length: 5,
          startLocation: { line: 1, offset: 7 },
          endLocation: { line: 1, offset: 12 },
          category: "error",
          code: 2322,
          relatedInformation: [
            {
              category: "message",
              code: 9001,
              message: "declared here",
              span: {
                file: relatedFile,
                start: { line: 2, offset: 1 },
                end: { line: 2, offset: 4 },
              },
            },
          ],
        },
      ],
      suggestionDiagnosticsSync: [
        {
          message: "unused value",
          start: 0,
          length: 5,
          startLocation: { line: 1, offset: 1 },
          endLocation: { line: 1, offset: 6 },
          category: "suggestion",
          code: 6133,
          reportsUnnecessary: true,
          reportsDeprecated: {},
        },
      ],
    };
    rpc.sendRequest.mockImplementation((_method: string, params: { arguments: [string] }) => {
      return Promise.resolve({
        type: "response",
        success: true,
        body: phases[params.arguments[0]],
      });
    });

    const result = await client.syncAndWaitForDiagnostics(file.filePath, "const value = 1;\n");

    expect(result).toEqual({
      kind: "completed",
      data: [
        expect.objectContaining({ message: "syntax warning", severity: 2, code: 100 }),
        expect.objectContaining({
          message: "type error",
          severity: 1,
          code: 2322,
          relatedInformation: [
            expect.objectContaining({
              location: expect.objectContaining({ uri: `file://${relatedFile}` }),
              message: "declared here",
            }),
          ],
        }),
        expect.objectContaining({ message: "unused value", severity: 4, tags: [1, 2] }),
      ],
    });
    expect(rpc.sendRequest.mock.calls.map((call) => call[1].arguments[0])).toEqual([
      "syntacticDiagnosticsSync",
      "semanticDiagnosticsSync",
      "suggestionDiagnosticsSync",
    ]);
    expect(rpc.sendRequest.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        command: "typescript.tsserverRequest",
        arguments: expect.arrayContaining([
          "syntacticDiagnosticsSync",
          { file: file.uri, includeLinePosition: true },
        ]),
      }),
    );
  });

  it("does not interpret unsupported ignored diagnostic configuration", async () => {
    const file = createFile();
    const { client, rpc } = createTypeScriptTestClient({
      root: file.filePath,
      cwd: file.filePath,
      initializationOptions: { diagnostics: { ignoredCodes: [2322] } },
    });
    rpc.sendRequest.mockResolvedValue({
      type: "response",
      success: true,
      body: [
        {
          message: "ignored",
          start: 0,
          length: 1,
          startLocation: { line: 1, offset: 1 },
          endLocation: { line: 1, offset: 2 },
          category: "error",
          code: 2322,
        },
      ],
    });

    const result = await client.syncAndWaitForDiagnostics(file.filePath, "const value = 1;\n");

    expect(result).toMatchObject({
      kind: "completed",
      data: [
        expect.objectContaining({ code: 2322, message: "ignored" }),
        expect.objectContaining({ code: 2322, message: "ignored" }),
        expect.objectContaining({ code: 2322, message: "ignored" }),
      ],
    });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(3);
  });

  it("rejects a failed or malformed phase without storing partial request evidence", async () => {
    const file = createFile();
    const { client, rpc } = createTypeScriptTestClient({ root: file.filePath, cwd: file.filePath });
    rpc.sendRequest
      .mockResolvedValueOnce({
        type: "response",
        success: true,
        body: [
          {
            message: "partial syntax error",
            start: 0,
            length: 1,
            startLocation: { line: 1, offset: 1 },
            endLocation: { line: 1, offset: 2 },
            category: "error",
            code: 1005,
          },
        ],
      })
      .mockResolvedValueOnce({ type: "response", success: true, body: [{ category: "error" }] });

    const result = await client.syncAndWaitForDiagnostics(file.filePath, "const value = 1;\n");

    expect(result.kind).toBe("unavailable");
    expect(client.getDiagnostics(file.filePath)).toEqual([]);
    expect(rpc.sendRequest).toHaveBeenCalledTimes(2);
  });

  it("rejects a failed phase envelope without storing earlier phase data", async () => {
    const file = createFile();
    const { client, rpc } = createTypeScriptTestClient({ root: file.filePath, cwd: file.filePath });
    rpc.sendRequest
      .mockResolvedValueOnce({ type: "response", success: true, body: [] })
      .mockResolvedValueOnce({
        type: "response",
        success: false,
        message: "tsserver request failed",
      });

    const result = await client.syncAndWaitForDiagnostics(file.filePath, "const value = 1;\n");

    expect(result.kind).toBe("unavailable");
    expect(client.getDiagnostics(file.filePath)).toEqual([]);
    expect(rpc.sendRequest).toHaveBeenCalledTimes(2);
  });

  it("rejects a successful response with no phase body", async () => {
    const file = createFile();
    const { client, rpc } = createTypeScriptTestClient({ root: file.filePath, cwd: file.filePath });
    rpc.sendRequest
      .mockResolvedValueOnce({ type: "response", success: true, body: [] })
      .mockResolvedValueOnce({ type: "response", success: true })
      .mockResolvedValueOnce({ type: "response", success: true, body: [] });

    const result = await client.syncAndWaitForDiagnostics(file.filePath, "const value = 1;\n");

    expect(result.kind).toBe("unavailable");
    expect(client.getDiagnostics(file.filePath)).toEqual([]);
    expect(rpc.sendRequest).toHaveBeenCalledTimes(2);
  });

  it("collects mixed native and TypeScript files through the priority adapter", async () => {
    const nativeFile = createFile("component.tsx");
    const typeScriptFile = createFile("main.ts");
    const { client, rpc } = createRunningTestClient({
      name: "typescript-language-server",
      command: "typescript-language-server",
      fileTypes: ["ts", "tsx"],
      capabilities: {
        diagnosticProvider: {
          interFileDependencies: false,
          workspaceDiagnostics: false,
          documentSelector: [{ language: "typescriptreact" }],
        },
        executeCommandProvider: { commands: ["typescript.tsserverRequest"] },
      },
      root: nativeFile.filePath,
      cwd: nativeFile.filePath,
    });
    rpc.sendRequest.mockImplementation((method: string) =>
      method === "textDocument/diagnostic"
        ? Promise.resolve({ kind: "full", items: [] })
        : Promise.resolve({ type: "response", success: true, body: [] }),
    );
    client.didOpen(nativeFile.filePath, "const component = true;\n");
    client.didOpen(typeScriptFile.filePath, "const value = 1;\n");

    await expect(
      client.refreshOpenDiagnostics({ maxWaitMs: 1_000, quietMs: 10 }),
    ).resolves.toMatchObject({
      requested: 2,
      confirmed: 2,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
    });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(4);
    expect(
      rpc.sendRequest.mock.calls.filter((call) => call[0] === "textDocument/diagnostic"),
    ).toHaveLength(1);
  });

  it("keeps native identifiers and selectors while leaving other files observational", async () => {
    const file = createFile("main.ts");
    const javascript = join(file.tmpDir, "other.js");
    writeFileSync(javascript, "const other = true;\n");
    const { client, rpc } = createRunningTestClient({
      name: "native-language-server",
      command: "native-language-server",
      fileTypes: ["ts", "js"],
      capabilities: {
        diagnosticProvider: {
          identifier: "native-v1",
          interFileDependencies: false,
          workspaceDiagnostics: false,
          documentSelector: [{ language: "typescript", scheme: "file", pattern: "*.ts" }],
        },
      },
      root: file.filePath,
      cwd: file.tmpDir,
    });
    rpc.sendRequest.mockResolvedValue({ kind: "full", items: [], resultId: "native-result" });
    client.didOpen(file.filePath, "const value = 1;\n");
    client.didOpen(javascript, "const other = true;\n");

    await expect(
      client.refreshOpenDiagnostics({ maxWaitMs: 30, quietMs: 1 }),
    ).resolves.toMatchObject({
      requested: 2,
      confirmed: 1,
      unconfirmed: 1,
      failed: 0,
      removed: 0,
    });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
    expect(rpc.sendRequest.mock.calls[0]?.[0]).toBe("textDocument/diagnostic");
    expect(rpc.sendRequest.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        identifier: "native-v1",
        previousResultId: undefined,
      }),
    );
    expect(client.hasDiagnosticProvider).toBe(true);
  });

  it("prefers native pull over the TypeScript adapter", async () => {
    const file = createFile();
    const { client, rpc } = createRunningTestClient({
      name: "typescript-language-server",
      command: "typescript-language-server",
      fileTypes: ["ts"],
      capabilities: {
        diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
        executeCommandProvider: { commands: ["typescript.tsserverRequest"] },
      },
      root: file.filePath,
      cwd: file.filePath,
    });
    rpc.sendRequest.mockResolvedValue({ kind: "full", items: [] });

    const result = await client.syncAndWaitForDiagnostics(file.filePath, "const value = 1;\n");

    expect(result).toEqual({ kind: "completed", data: [] });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
    expect(rpc.sendRequest.mock.calls[0]?.[0]).toBe("textDocument/diagnostic");
  });
});

describe("TypeScript diagnostic conversion", () => {
  it("converts ordinary location diagnostics without adapter-level suppression", () => {
    const diagnostic = normalizeTypeScriptDiagnostic({
      text: "message",
      start: { line: 2, offset: 3 },
      end: { line: 2, offset: 5 },
      category: "message",
      code: 1,
    });

    expect(diagnostic).toEqual({
      range: {
        start: { line: 1, character: 2 },
        end: { line: 1, character: 4 },
      },
      message: "message",
      severity: 3,
      code: 1,
      source: "typescript",
    });
    expect(
      normalizeTypeScriptDiagnostics([
        {
          text: "ignored",
          start: { line: 1, offset: 1 },
          end: { line: 1, offset: 2 },
          category: "error",
          code: 2,
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        code: 2,
        message: "ignored",
      }),
    ]);
  });
});
