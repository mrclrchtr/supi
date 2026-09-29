import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextDocumentSyncKind } from "vscode-languageserver-protocol";
import { LspClient } from "../../src/client/client.ts";
import { normalizeDocumentSync } from "../../src/client/client-document-sync.ts";
import { createRunningTestClient } from "../helpers/client-test-harness.ts";

const initializeServer = fileURLToPath(
  new URL("../fixtures/lsp-initialize-server.mjs", import.meta.url),
);
const configurationServer = fileURLToPath(
  new URL("../fixtures/lsp-configuration-server.mjs", import.meta.url),
);
const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("LSP server startup", () => {
  it("sends the workspace folder, initialization options, and environment", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "supi-lsp-handshake-"));
    tempDirectories.push(root);
    const recordPath = path.join(root, "handshake.json");
    const client = new LspClient(
      "test",
      {
        command: process.execPath,
        args: [initializeServer, "utf-16", recordPath],
        fileTypes: ["test"],
        rootMarkers: [],
        env: { SUPI_TEST_LSP_ENV: "configured" },
        initializationOptions: { mode: "project" },
      },
      root,
    );

    await client.start();
    const handshake = JSON.parse(fs.readFileSync(recordPath, "utf8")) as {
      env: string;
      params: {
        workspaceFolders: Array<{ name: string; uri: string }>;
        initializationOptions: unknown;
        capabilities: {
          workspace?: {
            configuration?: boolean;
            didChangeWatchedFiles?: unknown;
            workspaceFolders?: boolean;
          };
        };
      };
    };

    expect(handshake.env).toBe("configured");
    expect(handshake.params.workspaceFolders).toEqual([
      { name: path.basename(root), uri: `file://${root}` },
    ]);
    expect(handshake.params.capabilities.workspace?.workspaceFolders).toBe(true);
    expect(handshake.params.capabilities.workspace?.configuration).toBe(true);
    expect(handshake.params.capabilities.workspace).not.toHaveProperty("didChangeWatchedFiles");
    expect(handshake.params.initializationOptions).toEqual({ mode: "project" });

    await client.shutdown();
  });
});

describe("LSP server configuration", () => {
  it("orders initial configuration and validates public configuration requests", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "supi-lsp-configuration-"));
    tempDirectories.push(root);
    const recordPath = path.join(root, "configuration-events.jsonl");
    const settings = {
      python: { analysis: { typeCheckingMode: "strict" } },
      plain: "value",
    };
    const client = new LspClient(
      "configuration-test",
      {
        command: process.execPath,
        args: [configurationServer, recordPath],
        fileTypes: ["py"],
        rootMarkers: [],
        settings,
      },
      root,
    );
    settings.python.analysis.typeCheckingMode = "basic";

    await client.start();
    await vi.waitFor(() => {
      const lines = fs.readFileSync(recordPath, "utf8").trim().split("\n");
      expect(lines.some((line) => line.includes('"responseId":12'))).toBe(true);
    });

    const events = fs
      .readFileSync(recordPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const methods = events
      .filter((event) => typeof event.method === "string")
      .map((event) => event.method);
    expect(methods.slice(0, 3)).toEqual([
      "initialize",
      "initialized",
      "workspace/didChangeConfiguration",
    ]);

    const configurationResponse = events.find((event) => event.responseId === 11);
    expect(configurationResponse?.result).toEqual([
      "strict",
      "value",
      { python: { analysis: { typeCheckingMode: "strict" } }, plain: "value" },
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(events.find((event) => event.responseId === 12)?.result).toEqual([]);

    await client.shutdown();
  });
});

describe("LSP document synchronization", () => {
  it("normalizes structured and legacy synchronization options", () => {
    expect(normalizeDocumentSync(TextDocumentSyncKind.None)).toEqual({
      openClose: false,
      change: TextDocumentSyncKind.None,
      save: false,
      includeText: false,
    });
    expect(normalizeDocumentSync(TextDocumentSyncKind.Full)).toEqual({
      openClose: true,
      change: TextDocumentSyncKind.Full,
      save: true,
      includeText: false,
    });
    expect(
      normalizeDocumentSync({
        openClose: false,
        change: TextDocumentSyncKind.Incremental,
        save: { includeText: true },
      }),
    ).toEqual({
      openClose: false,
      change: TextDocumentSyncKind.Incremental,
      save: true,
      includeText: true,
    });
  });

  it("gates lifecycle notifications when the server disables synchronization", () => {
    const { client, rpc } = createRunningTestClient({
      capabilities: {
        textDocumentSync: { openClose: false, change: TextDocumentSyncKind.None },
      },
    });

    client.didOpen("/project/src/index.ts", "const value = 1;");
    client.didChange("/project/src/index.ts", "const value = 2;");
    client.didClose("/project/src/index.ts");

    expect(rpc.sendNotification).not.toHaveBeenCalled();
  });

  it("sends changed content before a requested save and does not save on refresh", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "supi-lsp-save-"));
    tempDirectories.push(root);
    const file = path.join(root, "index.ts");
    fs.writeFileSync(file, "const value = 1;");
    const { client, rpc } = createRunningTestClient({
      root,
      capabilities: {
        textDocumentSync: {
          openClose: true,
          change: TextDocumentSyncKind.Full,
          save: { includeText: true },
        },
      },
    });

    client.didOpen(file, "const value = 1;");
    rpc.sendNotification.mockClear();
    fs.writeFileSync(file, "const value = 2;");
    client.noteWorkspaceWrite(file);

    expect(rpc.sendNotification.mock.calls.map(([method]) => method)).toEqual([
      "textDocument/didChange",
      "textDocument/didSave",
    ]);
    expect(rpc.sendNotification).toHaveBeenNthCalledWith(
      2,
      "textDocument/didSave",
      expect.objectContaining({ text: "const value = 2;" }),
    );

    rpc.sendNotification.mockClear();
    await client.refreshOpenDiagnostics({ maxWaitMs: 1, quietMs: 1 });
    expect(rpc.sendNotification).not.toHaveBeenCalledWith(
      "textDocument/didSave",
      expect.anything(),
    );
  });

  it("sends one save for an external disk change observed by a semantic request", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "supi-lsp-external-save-"));
    tempDirectories.push(root);
    const file = path.join(root, "index.ts");
    fs.writeFileSync(file, "const value = 1;");
    const { client, rpc } = createRunningTestClient({
      root,
      capabilities: {
        textDocumentSync: {
          openClose: true,
          change: TextDocumentSyncKind.Full,
          save: { includeText: true },
        },
      },
    });

    client.didOpen(file, "const value = 1;");
    rpc.sendNotification.mockClear();
    fs.writeFileSync(file, "const value = 2;");
    await client.hover(file, { line: 0, character: 6 });

    expect(rpc.sendNotification.mock.calls.map(([method]) => method)).toEqual([
      "textDocument/didChange",
      "textDocument/didSave",
    ]);
    expect(rpc.sendNotification).toHaveBeenLastCalledWith("textDocument/didSave", {
      textDocument: { uri: `file://${file}` },
      text: "const value = 2;",
    });

    rpc.sendNotification.mockClear();
    await client.hover(file, { line: 0, character: 6 });
    expect(rpc.sendNotification).not.toHaveBeenCalled();
  });

  it("sends one save when refresh observes an external disk change", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "supi-lsp-refresh-save-"));
    tempDirectories.push(root);
    const file = path.join(root, "index.ts");
    fs.writeFileSync(file, "const value = 1;");
    const { client, rpc } = createRunningTestClient({
      root,
      capabilities: {
        textDocumentSync: {
          openClose: true,
          change: TextDocumentSyncKind.Full,
          save: true,
        },
      },
    });

    client.didOpen(file, "const value = 1;");
    rpc.sendNotification.mockClear();
    fs.writeFileSync(file, "const value = 2;");
    await client.refreshOpenDiagnostics({ maxWaitMs: 1, quietMs: 1 });

    expect(rpc.sendNotification.mock.calls.map(([method]) => method)).toEqual([
      "textDocument/didChange",
      "textDocument/didSave",
    ]);
    rpc.sendNotification.mockClear();
    await client.refreshOpenDiagnostics({ maxWaitMs: 1, quietMs: 1 });
    expect(rpc.sendNotification).not.toHaveBeenCalledWith(
      "textDocument/didSave",
      expect.anything(),
    );
  });

  it.each([
    ["an empty document", "", { line: 0, character: 0 }],
    ["a final line", "abc", { line: 0, character: 3 }],
    ["a trailing newline", "abc\n", { line: 1, character: 0 }],
    ["CRLF lines", "abc\r\ndef", { line: 1, character: 3 }],
  ])("replaces the full range of %s for incremental servers", (_label, previous, end) => {
    const { client, rpc } = createRunningTestClient({
      capabilities: { textDocumentSync: { change: 2, openClose: true } },
    });
    const file = "/project/src/index.ts";

    client.didOpen(file, previous);
    rpc.sendNotification.mockClear();
    client.didChange(file, "updated");

    expect(rpc.sendNotification).toHaveBeenCalledWith("textDocument/didChange", {
      textDocument: { uri: "file:///project/src/index.ts", version: 2 },
      contentChanges: [
        {
          range: {
            start: { line: 0, character: 0 },
            end,
          },
          text: "updated",
        },
      ],
    });
  });
});
