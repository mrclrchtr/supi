import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  type ApplyOptions,
  applyWorkspaceEdit as applyWorkspaceEditImpl,
} from "../../../../src/analysis/refactor/apply.ts";

// Hoisted shared state: the mock records every file path whose queue is acquired,
// in acquisition order, while still running the real fn so the apply happens.
const { acquiredFiles, beforeQueuedCallbacks, queueMock } = vi.hoisted(() => {
  const acquiredFiles: string[] = [];
  const beforeQueuedCallbacks: Array<(filePath: string) => void> = [];
  const queueMock = async <T>(filePath: string, fn: () => Promise<T>): Promise<T> => {
    acquiredFiles.push(filePath);
    beforeQueuedCallbacks.shift()?.(filePath);
    return fn();
  };
  return { acquiredFiles, beforeQueuedCallbacks, queueMock };
});

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const original = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return { ...original, withFileMutationQueue: queueMock };
});

function applyWorkspaceEdit(
  edit: Parameters<typeof applyWorkspaceEditImpl>[0],
  options: Partial<ApplyOptions> = {},
) {
  const firstFile = edit.edits[0]?.file;
  const inferredRoot = firstFile
    ? realpathSync(path.dirname(firstFile))
    : realpathSync(process.cwd());
  return applyWorkspaceEditImpl(edit, {
    authorizedMutationRoots: [inferredRoot],
    ...options,
  });
}

describe("applyWorkspaceEdit file-mutation queue", () => {
  it("acquires withFileMutationQueue for every involved file in sorted path order", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "apply-queue-"));
    const a = path.join(tmpDir, "a.ts");
    const b = path.join(tmpDir, "b.ts");
    const c = path.join(tmpDir, "c.ts");
    writeFileSync(a, "aaa");
    writeFileSync(b, "bbb");
    writeFileSync(c, "ccc");
    acquiredFiles.length = 0;

    try {
      // Pass edits in non-sorted file order (c, a, b) to prove the implementation sorts.
      const result = await applyWorkspaceEdit({
        edits: [
          {
            file: c,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
            newText: "ccc2",
          },
          {
            file: a,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
            newText: "aaa2",
          },
          {
            file: b,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
            newText: "bbb2",
          },
        ],
      });

      expect(result.kind).toBe("applied");
      // Queues acquired in sorted path order, regardless of input edit order.
      expect(acquiredFiles).toEqual([a, b, c]);
      // The real fn ran inside the queued window, so files changed.
      expect(readFileSync(a, "utf-8")).toBe("aaa2");
      expect(readFileSync(b, "utf-8")).toBe("bbb2");
      expect(readFileSync(c, "utf-8")).toBe("ccc2");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("revalidates fingerprints after entering the mutation queue", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "apply-queue-race-"));
    const file = path.join(tmpDir, "source.ts");
    const original = "const value = 'old';\n";
    writeFileSync(file, original);
    beforeQueuedCallbacks.push(() => writeFileSync(file, "const value = 'sibling';\n"));

    try {
      const result = await applyWorkspaceEdit(
        {
          edits: [
            {
              file,
              range: { start: { line: 0, character: 15 }, end: { line: 0, character: 18 } },
              newText: "new",
            },
          ],
        },
        { expectedFingerprints: new Map([[file, sha256(original)]]) },
      );

      expect(result).toMatchObject({ kind: "error" });
      expect(readFileSync(file, "utf-8")).toBe("const value = 'sibling';\n");
    } finally {
      beforeQueuedCallbacks.length = 0;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects a parent path that becomes an escaping symlink inside the queue", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "apply-queue-symlink-"));
    const project = path.join(tmpDir, "project");
    const sourceDirectory = path.join(project, "src");
    const file = path.join(sourceDirectory, "source.ts");
    const outsideDirectory = path.join(tmpDir, "outside");
    const outsideFile = path.join(outsideDirectory, "source.ts");
    const original = "const value = 'old';\n";
    mkdirSync(sourceDirectory, { recursive: true });
    mkdirSync(outsideDirectory, { recursive: true });
    writeFileSync(file, original);
    writeFileSync(outsideFile, original);
    beforeQueuedCallbacks.push(() => {
      renameSync(sourceDirectory, path.join(project, "preserved-src"));
      symlinkSync(outsideDirectory, sourceDirectory, "dir");
    });

    try {
      const result = await applyWorkspaceEdit(
        {
          edits: [
            {
              file,
              range: { start: { line: 0, character: 15 }, end: { line: 0, character: 18 } },
              newText: "new",
            },
          ],
        },
        {
          authorizedMutationRoots: [realpathSync(project)],
          expectedFingerprints: new Map([[file, sha256(original)]]),
        },
      );

      expect(result).toEqual({
        kind: "error",
        reason: expect.stringContaining("outside the authorized provider roots"),
      });
      expect(readFileSync(outsideFile, "utf-8")).toBe(original);
    } finally {
      beforeQueuedCallbacks.length = 0;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rechecks an open-document version inside the mutation queue", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "apply-queue-version-"));
    const file = path.join(tmpDir, "source.ts");
    const original = "const value = 'old';\n";
    writeFileSync(file, original);
    let openVersion = 1;
    beforeQueuedCallbacks.push(() => {
      openVersion = 2;
    });

    try {
      const result = await applyWorkspaceEdit(
        {
          edits: [
            {
              file,
              range: { start: { line: 0, character: 15 }, end: { line: 0, character: 18 } },
              newText: "new",
            },
          ],
          documentPreconditions: [{ file, kind: "open-document-version", version: 1 }],
        },
        {
          authorizedMutationRoots: [realpathSync(tmpDir)],
          expectedFingerprints: new Map([[file, sha256(original)]]),
          getOpenDocumentVersion: () => openVersion,
        },
      );

      expect(result).toEqual({
        kind: "error",
        reason: expect.stringContaining("open document version has changed"),
      });
      expect(readFileSync(file, "utf-8")).toBe(original);
    } finally {
      beforeQueuedCallbacks.length = 0;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rechecks a disk-content precondition inside the mutation queue", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "apply-queue-disk-state-"));
    const file = path.join(tmpDir, "source.ts");
    const original = "const value = 'old';\n";
    writeFileSync(file, original);
    let openVersion: number | null = null;
    beforeQueuedCallbacks.push(() => {
      openVersion = 1;
    });

    try {
      const result = await applyWorkspaceEdit(
        {
          edits: [
            {
              file,
              range: { start: { line: 0, character: 15 }, end: { line: 0, character: 18 } },
              newText: "new",
            },
          ],
          documentPreconditions: [{ file, kind: "disk-content" }],
        },
        {
          authorizedMutationRoots: [realpathSync(tmpDir)],
          expectedFingerprints: new Map([[file, sha256(original)]]),
          getOpenDocumentVersion: () => openVersion,
        },
      );

      expect(result).toEqual({
        kind: "error",
        reason: expect.stringContaining("no longer uses disk content"),
      });
      expect(readFileSync(file, "utf-8")).toBe(original);
    } finally {
      beforeQueuedCallbacks.length = 0;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects a file that becomes non-regular inside the mutation queue", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "apply-queue-non-regular-"));
    const file = path.join(tmpDir, "source.ts");
    const original = "const value = 'old';\n";
    writeFileSync(file, original);
    beforeQueuedCallbacks.push(() => {
      rmSync(file);
      mkdirSync(file);
    });

    try {
      const result = await applyWorkspaceEdit(
        {
          edits: [
            {
              file,
              range: { start: { line: 0, character: 15 }, end: { line: 0, character: 18 } },
              newText: "new",
            },
          ],
        },
        { expectedFingerprints: new Map([[file, sha256(original)]]) },
      );

      expect(result).toEqual({
        kind: "error",
        reason: expect.stringContaining("not a regular file"),
      });
    } finally {
      beforeQueuedCallbacks.length = 0;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns a typed authority error if a queued file disappears", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "apply-queue-delete-"));
    const file = path.join(tmpDir, "source.ts");
    const original = "const value = 'old';\n";
    writeFileSync(file, original);
    beforeQueuedCallbacks.push(() => rmSync(file));

    try {
      const result = await applyWorkspaceEdit(
        {
          edits: [
            {
              file,
              range: { start: { line: 0, character: 15 }, end: { line: 0, character: 18 } },
              newText: "new",
            },
          ],
        },
        { expectedFingerprints: new Map([[file, sha256(original)]]) },
      );

      expect(result).toMatchObject({
        kind: "error",
        reason: expect.stringContaining("not a readable regular file"),
      });
    } finally {
      beforeQueuedCallbacks.length = 0;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
