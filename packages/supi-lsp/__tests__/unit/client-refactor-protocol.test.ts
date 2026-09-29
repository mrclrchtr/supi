import { rmSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodeActionContext, Range } from "../../src/config/types.ts";
import {
  createDiagnosticTestFile,
  createRunningTestClient,
} from "../helpers/client-test-harness.ts";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("LSP rename requests", () => {
  it("does not request rename when the server does not advertise it", async () => {
    const { client, rpc } = createRunningTestClient({ capabilities: {} });

    await expect(
      client.renameDetailed("/project/index.ts", { line: 0, character: 0 }, "next"),
    ).resolves.toEqual({
      kind: "unavailable",
      reason: "The server does not advertise textDocument/rename.",
    });
    expect(rpc.sendRequest).not.toHaveBeenCalled();
  });

  it("prepares a rename before sending the edit request", async () => {
    const { client, rpc } = createRunningTestClient({
      capabilities: { renameProvider: { prepareProvider: true } },
    });
    rpc.sendRequest
      .mockResolvedValueOnce({
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 },
      })
      .mockResolvedValueOnce({ changes: {} });

    await expect(
      client.renameDetailed("/project/index.ts", { line: 0, character: 2 }, "next"),
    ).resolves.toEqual({ kind: "completed", data: { changes: {} } });
    expect(rpc.sendRequest.mock.calls.map(([method]) => method)).toEqual([
      "textDocument/prepareRename",
      "textDocument/rename",
    ]);
  });

  it.each([
    ["null rejection", null],
    ["malformed result", { range: { start: { line: 0, character: 0 } } }],
    [
      "position outside range",
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
    ],
  ])("does not send rename after a prepare response is invalid: %s", async (_label, prepared) => {
    const { client, rpc } = createRunningTestClient({
      capabilities: { renameProvider: { prepareProvider: true } },
    });
    rpc.sendRequest.mockResolvedValueOnce(prepared);

    const result = await client.renameDetailed(
      "/project/index.ts",
      { line: 0, character: 3 },
      "next",
    );

    expect(result.kind).toBe("unavailable");
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
    expect(rpc.sendRequest.mock.calls[0]?.[0]).toBe("textDocument/prepareRename");
  });

  it("keeps direct rename when preparation is not advertised", async () => {
    const { client, rpc } = createRunningTestClient({ capabilities: { renameProvider: true } });
    rpc.sendRequest.mockResolvedValueOnce(null);

    await expect(
      client.renameDetailed("/project/index.ts", { line: 0, character: 0 }, "next"),
    ).resolves.toEqual({ kind: "completed", data: null });
    expect(rpc.sendRequest).toHaveBeenCalledWith(
      "textDocument/rename",
      expect.any(Object),
      undefined,
    );
  });

  it("does not retry a ContentModified rename after content changes", async () => {
    const target = createDiagnosticTestFile("rename.ts", "const oldName = 1;\n");
    temporaryDirectories.push(target.tmpDir);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      capabilities: { renameProvider: true },
    });
    client.didOpen(target.filePath, "const oldName = 1;\n");
    const response = deferred<unknown>();
    rpc.sendRequest.mockImplementationOnce(() => response.promise);

    const request = client.renameDetailed(target.filePath, { line: 0, character: 6 }, "newName");
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    client.didChange(target.filePath, "const changed = 1;\n");
    response.reject(Object.assign(new Error("server content changed"), { code: -32801 }));

    await expect(request).resolves.toMatchObject({
      kind: "unavailable",
      reason: "LSP request textDocument/rename failed: server content changed",
    });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });

  it("stops a prepared rename when disk content changes", async () => {
    const target = createDiagnosticTestFile("rename.ts", "const oldName = 1;\n");
    temporaryDirectories.push(target.tmpDir);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      capabilities: { renameProvider: { prepareProvider: true } },
    });
    client.didOpen(target.filePath, "const oldName = 1;\n");
    const prepared = deferred<unknown>();
    rpc.sendRequest.mockImplementationOnce(() => prepared.promise);

    const request = client.renameDetailed(target.filePath, { line: 0, character: 6 }, "newName");
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    writeFileSync(target.filePath, "const changed = 1;\n");
    prepared.resolve({
      start: { line: 0, character: 6 },
      end: { line: 0, character: 13 },
    });

    await expect(request).resolves.toMatchObject({ kind: "unavailable" });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });
});

describe("LSP code-action requests", () => {
  it("sends only and invoked context, then resolves lazy edit data", async () => {
    const { client, rpc } = createRunningTestClient({
      capabilities: {
        codeActionProvider: {
          codeActionKinds: ["source.organizeImports"],
          resolveProvider: true,
        },
      },
    });
    const action = {
      title: "Organize imports",
      kind: "source.organizeImports",
      data: { request: "stable" },
    };
    rpc.sendRequest
      .mockResolvedValueOnce([action])
      .mockResolvedValueOnce({ edit: { changes: { "file:///project/index.ts": [] } } });

    const result = await client.codeActionsDetailed(
      "/project/index.ts",
      { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      { diagnostics: [], only: ["source.organizeImports"] },
    );

    expect(result.kind).toBe("completed");
    expect(rpc.sendRequest.mock.calls.map(([method]) => method)).toEqual([
      "textDocument/codeAction",
      "codeAction/resolve",
    ]);
    expect(rpc.sendRequest.mock.calls[0]?.[1]).toMatchObject({
      context: {
        only: ["source.organizeImports"],
        triggerKind: 1,
      },
    });
    expect(rpc.sendRequest.mock.calls[1]?.[1]).toEqual(action);
    if (result.kind === "completed") {
      expect(result.data?.[0]).toMatchObject({ title: action.title, data: action.data });
    }
  });

  it.each([
    ["malformed range", { start: { line: 1, character: 0 } }, { diagnostics: [] }],
    [
      "malformed context",
      { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      null,
    ],
    [
      "malformed kind filter",
      { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      { diagnostics: [], only: [1] },
    ],
  ])("rejects invalid code-action input before transport: %s", async (_label, range, context) => {
    const { client, rpc } = createRunningTestClient({ capabilities: { codeActionProvider: true } });
    const result = await client.codeActionsDetailed(
      "/project/index.ts",
      range as unknown as Range,
      context as unknown as CodeActionContext,
    );

    expect(result.kind).toBe("unavailable");
    expect(rpc.sendRequest).not.toHaveBeenCalled();
  });

  it("reports an unsupported requested kind before transport", async () => {
    const { client, rpc } = createRunningTestClient({
      capabilities: { codeActionProvider: { codeActionKinds: ["quickfix"] } },
    });

    await expect(
      client.codeActionsDetailed(
        "/project/index.ts",
        { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        { diagnostics: [], only: ["source.removeUnused"] },
      ),
    ).resolves.toMatchObject({ kind: "unavailable" });
    expect(rpc.sendRequest).not.toHaveBeenCalled();
  });

  it("does not resolve command-only actions", async () => {
    const { client, rpc } = createRunningTestClient({
      capabilities: { codeActionProvider: { resolveProvider: true } },
    });
    rpc.sendRequest.mockResolvedValueOnce([
      {
        title: "Run fix",
        kind: "source.organizeImports",
        command: { title: "fix", command: "fix" },
      },
    ]);

    const result = await client.codeActionsDetailed(
      "/project/index.ts",
      { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      { diagnostics: [] },
    );

    expect(result.kind).toBe("completed");
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["null response entry", null],
    ["numeric response kind", { title: "Bad action", kind: 1 }],
  ])("rejects malformed response entries before matching: %s", async (_label, entry) => {
    const { client, rpc } = createRunningTestClient({
      capabilities: { codeActionProvider: true },
    });
    rpc.sendRequest.mockResolvedValueOnce([entry]);

    const result = await client.codeActionsDetailed(
      "/project/index.ts",
      { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      { diagnostics: [] },
    );

    expect(result).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("malformed code action response entry"),
    });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });

  it("keeps a valid standard Command response editless and unsupported", async () => {
    const command = {
      title: "Run fix",
      command: "server.runFix",
      arguments: [{ file: "/project/index.ts" }],
    };
    const { client, rpc } = createRunningTestClient({
      capabilities: { codeActionProvider: true },
    });
    rpc.sendRequest.mockResolvedValueOnce([command]);

    const result = await client.codeActionsDetailed(
      "/project/index.ts",
      { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      { diagnostics: [] },
    );

    expect(result).toEqual({
      kind: "completed",
      data: [{ title: command.title, command }],
    });
  });

  it("rejects a resolved action when disk content changes during resolution", async () => {
    const target = createDiagnosticTestFile("organize.ts", 'import { old } from "pkg";\n');
    temporaryDirectories.push(target.tmpDir);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      capabilities: {
        codeActionProvider: {
          codeActionKinds: ["source.organizeImports"],
          resolveProvider: true,
        },
      },
    });
    client.didOpen(target.filePath, 'import { old } from "pkg";\n');
    const resolved = deferred<unknown>();
    rpc.sendRequest
      .mockResolvedValueOnce([
        { title: "Organize imports", kind: "source.organizeImports", data: { stable: true } },
      ])
      .mockImplementationOnce(() => resolved.promise);

    const request = client.codeActionsDetailed(
      target.filePath,
      { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      { diagnostics: [], only: ["source.organizeImports"] },
    );
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(2));
    writeFileSync(target.filePath, 'import { changed } from "pkg";\n');
    resolved.resolve({
      edit: {
        changes: {
          [`file://${target.filePath}`]: [],
        },
      },
    });

    await expect(request).resolves.toMatchObject({ kind: "unavailable" });
  });

  it("forwards cancellation through code-action resolution", async () => {
    const { client, rpc } = createRunningTestClient({
      capabilities: { codeActionProvider: { resolveProvider: true } },
    });
    const resolved = deferred<unknown>();
    rpc.sendRequest
      .mockResolvedValueOnce([{ title: "Organize imports", kind: "source.organizeImports" }])
      .mockImplementationOnce(() => resolved.promise);
    const controller = new AbortController();
    const control = { signal: controller.signal };
    const request = client.codeActionsDetailed(
      "/project/index.ts",
      { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      { diagnostics: [], only: ["source.organizeImports"] },
      control,
    );
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(2));
    expect(rpc.sendRequest.mock.calls[1]?.[2]).toBe(control);
    controller.abort(new Error("cancelled during code-action resolution"));
    resolved.resolve({ edit: { changes: { "file:///project/index.ts": [] } } });

    await expect(request).rejects.toThrow("cancelled during code-action resolution");
  });

  it("does not dispatch code actions after the deadline expires", async () => {
    const { client, rpc } = createRunningTestClient({
      capabilities: { codeActionProvider: true },
    });

    await expect(
      client.codeActionsDetailed(
        "/project/index.ts",
        { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        { diagnostics: [] },
        { deadline: Date.now() - 1 },
      ),
    ).rejects.toThrow("Code request deadline exceeded");
    expect(rpc.sendRequest).not.toHaveBeenCalled();
  });
});
