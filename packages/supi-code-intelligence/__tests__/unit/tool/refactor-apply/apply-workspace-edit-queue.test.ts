import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { applyWorkspaceEdit } from "../../../../src/analysis/refactor/apply.ts";

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

  it("returns a typed stale-plan error if a queued file disappears", async () => {
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
        reason: expect.stringContaining("changed since the plan was generated"),
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
