import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LspManager } from "../../src/manager/manager.ts";
import { createWorkspaceLspRuntimeOwner } from "../../src/session/runtime-registry.ts";

const temporaryDirectories: string[] = [];

function createFiles(): { root: string; target: string; reference: string } {
  const root = mkdtempSync(join(tmpdir(), "lsp-rename-runtime-"));
  temporaryDirectories.push(root);
  const target = join(root, "model.go");
  const reference = join(root, "widget.go");
  writeFileSync(target, "package model\nfunc Model() {}\n", "utf-8");
  writeFileSync(reference, "package model\nfunc Use() { Model() }\n", "utf-8");
  return { root, target, reference };
}

function workspaceEdit(files: string[], version: number) {
  return {
    documentChanges: files.map((file) => ({
      textDocument: { uri: pathToFileURL(file).href, version },
      edits: [
        {
          range: { start: { line: 1, character: 5 }, end: { line: 1, character: 10 } },
          newText: "Renamed",
        },
      ],
    })),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("workspace LSP rename snapshots", () => {
  it("enrolls unknown-version targets and returns only a fresh follow-up response", async () => {
    const { root, target, reference } = createFiles();
    const firstEdit = workspaceEdit([target, reference], 0);
    const finalEdit = workspaceEdit([target, reference], 1);
    const snapshots = (files: string[]) =>
      files.map((filePath) => ({
        filePath,
        version: 1,
        contentFingerprint: "same-content",
        diskContentFingerprint: "same-content",
      }));
    const client = {
      name: "go",
      root,
      renameDetailedWithSnapshots: vi
        .fn()
        .mockResolvedValueOnce({
          result: { kind: "completed", data: firstEdit },
          inputRevision: 1,
          documentSnapshots: snapshots([target]),
        })
        .mockResolvedValueOnce({
          result: { kind: "completed", data: finalEdit },
          documentSnapshots: snapshots([target, reference]),
        }),
    };
    const manager = {
      getCwd: () => root,
      ensureFileOpen: vi.fn().mockResolvedValue(client),
      enrollRenameDocuments: vi.fn().mockResolvedValue({ kind: "enrolled" }),
      getOpenDocumentVersion: vi.fn().mockReturnValue(1),
    } as unknown as LspManager;
    const runtime = createWorkspaceLspRuntimeOwner(manager).runtime;

    const response = await runtime.rename(target, { line: 1, character: 5 }, "Renamed");

    expect(manager.enrollRenameDocuments).toHaveBeenCalledWith(
      client,
      [target, reference],
      undefined,
    );
    expect(client.renameDetailedWithSnapshots).toHaveBeenCalledTimes(2);
    expect(client.renameDetailedWithSnapshots.mock.calls[1]?.[3]).toEqual({
      control: undefined,
      snapshotFiles: [target, reference],
      inputRevision: 1,
    });
    expect(response?.value).toBe(finalEdit);
    expect(response?.documentSnapshots).toEqual(
      snapshots([target, reference]).map(({ filePath, ...snapshot }) => ({
        file: filePath,
        ...snapshot,
      })),
    );
  });

  it("caps discovered files before enrollment", async () => {
    const { root, target } = createFiles();
    const files = Array.from({ length: 65 }, (_, index) => join(root, `file-${index}.go`));
    const client = {
      name: "go",
      root,
      renameDetailedWithSnapshots: vi.fn().mockResolvedValue({
        result: { kind: "completed", data: workspaceEdit(files, 0) },
        documentSnapshots: [],
      }),
    };
    const manager = {
      getCwd: () => root,
      ensureFileOpen: vi.fn().mockResolvedValue(client),
      enrollRenameDocuments: vi.fn(),
    } as unknown as LspManager;
    const runtime = createWorkspaceLspRuntimeOwner(manager).runtime;

    const response = await runtime.rename(target, { line: 1, character: 5 }, "Renamed");

    expect(manager.enrollRenameDocuments).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      value: null,
      reason: expect.stringContaining("too many files"),
    });
  });

  it("fails closed when the follow-up response adds an unverified document", async () => {
    const { root, target, reference } = createFiles();
    const added = join(root, "added.go");
    writeFileSync(added, "package model\n", "utf-8");
    const client = {
      name: "go",
      root,
      renameDetailedWithSnapshots: vi
        .fn()
        .mockResolvedValueOnce({
          result: { kind: "completed", data: workspaceEdit([target, reference], 0) },
          inputRevision: 1,
          documentSnapshots: [],
        })
        .mockResolvedValueOnce({
          result: { kind: "completed", data: workspaceEdit([target, reference, added], 1) },
          documentSnapshots: [
            ...[target, reference].map((filePath) => ({
              filePath,
              version: 1,
              contentFingerprint: "same-content",
              diskContentFingerprint: "same-content",
            })),
          ],
        }),
    };
    const manager = {
      getCwd: () => root,
      ensureFileOpen: vi.fn().mockResolvedValue(client),
      enrollRenameDocuments: vi.fn().mockResolvedValue({ kind: "enrolled" }),
    } as unknown as LspManager;
    const runtime = createWorkspaceLspRuntimeOwner(manager).runtime;

    const response = await runtime.rename(target, { line: 1, character: 5 }, "Renamed");

    expect(client.renameDetailedWithSnapshots).toHaveBeenCalledTimes(2);
    expect(response).toMatchObject({
      value: null,
      reason: expect.stringContaining("changed its edit targets"),
    });
  });

  it("does not enroll documents from a malformed resource edit", async () => {
    const { root, target } = createFiles();
    const client = {
      name: "go",
      root,
      renameDetailedWithSnapshots: vi.fn().mockResolvedValue({
        result: {
          kind: "completed",
          data: {
            documentChanges: [{ kind: "delete", uri: pathToFileURL(target).href }],
          },
        },
        documentSnapshots: [],
      }),
    };
    const manager = {
      getCwd: () => root,
      ensureFileOpen: vi.fn().mockResolvedValue(client),
      enrollRenameDocuments: vi.fn(),
    } as unknown as LspManager;
    const runtime = createWorkspaceLspRuntimeOwner(manager).runtime;

    const response = await runtime.rename(target, { line: 1, character: 5 }, "Renamed");

    expect(manager.enrollRenameDocuments).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      value: null,
      reason: expect.stringContaining("resource operation"),
    });
  });

  it("preserves cancellation raised while enrolling discovered documents", async () => {
    const { root, target, reference } = createFiles();
    const controller = new AbortController();
    const control = { signal: controller.signal, deadline: Date.now() + 60_000 };
    const cancellation = new Error("rename cancelled during enrollment");
    const client = {
      name: "go",
      root,
      renameDetailedWithSnapshots: vi.fn().mockResolvedValue({
        result: {
          kind: "completed",
          data: workspaceEdit([target, reference], 0),
        },
        inputRevision: 1,
        documentSnapshots: [],
      }),
    };
    const manager = {
      getCwd: () => root,
      ensureFileOpen: vi.fn().mockResolvedValue(client),
      enrollRenameDocuments: vi.fn().mockImplementation(async () => {
        controller.abort(cancellation);
        throw cancellation;
      }),
    } as unknown as LspManager;
    const runtime = createWorkspaceLspRuntimeOwner(manager).runtime;

    await expect(
      runtime.rename(target, { line: 1, character: 5 }, "Renamed", control),
    ).rejects.toBe(cancellation);
    expect(client.renameDetailedWithSnapshots).toHaveBeenCalledTimes(1);
  });
});
