import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("applyWorkspaceEdit", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "apply-workspace-edit-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function write(file: string, content: string) {
    writeFileSync(path.join(tmpDir, file), content, "utf-8");
  }

  function read(file: string): string {
    return readFileSync(path.join(tmpDir, file), "utf-8");
  }

  function absPath(file: string): string {
    return path.join(tmpDir, file);
  }

  it("applies a single-file single-edit replacement", async () => {
    const { applyWorkspaceEdit } = await import("../../src/refactor/apply-workspace-edit.ts");

    write("a.ts", "hello old goodbye");

    const result = applyWorkspaceEdit({
      edits: [
        {
          file: absPath("a.ts"),
          range: { start: { line: 0, character: 6 }, end: { line: 0, character: 9 } },
          newText: "new",
        },
      ],
    });

    expect(result.kind).toBe("applied");
    if (result.kind === "applied") {
      expect(result.filesChanged).toBe(1);
      expect(result.totalEdits).toBe(1);
    }
    expect(read("a.ts")).toBe("hello new goodbye");
  });

  it("applies multi-file edits atomically", async () => {
    const { applyWorkspaceEdit } = await import("../../src/refactor/apply-workspace-edit.ts");

    write("a.ts", "apple");
    write("b.ts", "banana");

    const result = applyWorkspaceEdit({
      edits: [
        {
          file: absPath("a.ts"),
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
          newText: "orange",
        },
        {
          file: absPath("b.ts"),
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
          newText: "kiwi",
        },
      ],
    });

    expect(result.kind).toBe("applied");
    expect(read("a.ts")).toBe("orange");
    expect(read("b.ts")).toBe("kiwi");
  });

  it("does not partially commit when a later write fails", async () => {
    const { applyWorkspaceEdit } = await import("../../src/refactor/apply-workspace-edit.ts");

    write("a.ts", "old-a");
    const lockedDir = absPath("locked");
    mkdirSync(lockedDir, { recursive: true });
    const lockedFile = path.join(lockedDir, "b.ts");
    writeFileSync(lockedFile, "old-b", "utf-8");
    chmodSync(lockedDir, 0o555);
    chmodSync(lockedFile, 0o444);

    try {
      const result = applyWorkspaceEdit({
        edits: [
          {
            file: absPath("a.ts"),
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            newText: "new-a",
          },
          {
            file: lockedFile,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            newText: "new-b",
          },
        ],
      });

      expect(result.kind).toBe("error");
      expect(read("a.ts")).toBe("old-a");
      expect(readFileSync(lockedFile, "utf-8")).toBe("old-b");
    } finally {
      chmodSync(lockedFile, 0o644);
      chmodSync(lockedDir, 0o755);
    }
  });

  it("applies edits in descending offset order on the same line", async () => {
    const { applyWorkspaceEdit } = await import("../../src/refactor/apply-workspace-edit.ts");

    write("a.ts", "foo bar baz");

    const result = applyWorkspaceEdit({
      edits: [
        {
          file: absPath("a.ts"),
          range: { start: { line: 0, character: 4 }, end: { line: 0, character: 7 } },
          newText: "XXX",
        },
        {
          file: absPath("a.ts"),
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
          newText: "YYY",
        },
      ],
    });

    expect(result.kind).toBe("applied");
    expect(read("a.ts")).toBe("YYY XXX baz");
  });

  it("applies multi-line edits correctly", async () => {
    const { applyWorkspaceEdit } = await import("../../src/refactor/apply-workspace-edit.ts");

    write("a.ts", "line1\nline2\nline3");

    const result = applyWorkspaceEdit({
      edits: [
        {
          file: absPath("a.ts"),
          range: { start: { line: 1, character: 0 }, end: { line: 2, character: 5 } },
          newText: "replaced",
        },
      ],
    });

    expect(result.kind).toBe("applied");
    expect(read("a.ts")).toBe("line1\nreplaced");
  });

  it("returns error for out-of-range line indices", async () => {
    const { applyWorkspaceEdit } = await import("../../src/refactor/apply-workspace-edit.ts");

    write("a.ts", "short");

    const result = applyWorkspaceEdit({
      edits: [
        {
          file: absPath("a.ts"),
          range: { start: { line: 10, character: 0 }, end: { line: 10, character: 5 } },
          newText: "long",
        },
      ],
    });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.reason).toContain("line 10");
      expect(result.reason).toContain("only 1 line");
    }
    expect(read("a.ts")).toBe("short");
  });

  it("returns error for character positions beyond the actual line length", async () => {
    const { applyWorkspaceEdit } = await import("../../src/refactor/apply-workspace-edit.ts");

    write("a.ts", "abc\n");

    const result = applyWorkspaceEdit({
      edits: [
        {
          file: absPath("a.ts"),
          range: { start: { line: 0, character: 99 }, end: { line: 0, character: 99 } },
          newText: "X",
        },
      ],
    });

    expect(result.kind).toBe("error");
    expect(read("a.ts")).toBe("abc\n");
  });

  it("returns error when a source file does not exist", async () => {
    const { applyWorkspaceEdit } = await import("../../src/refactor/apply-workspace-edit.ts");

    const result = applyWorkspaceEdit({
      edits: [
        {
          file: absPath("nonexistent.ts"),
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
          newText: "new",
        },
      ],
    });

    expect(result.kind).toBe("error");
  });

  it("handles nested file paths correctly", async () => {
    const { applyWorkspaceEdit } = await import("../../src/refactor/apply-workspace-edit.ts");

    const nestedFile = absPath("nested/src/index.ts");
    mkdirSync(path.dirname(nestedFile), { recursive: true });
    writeFileSync(nestedFile, "old content", "utf-8");

    const result = applyWorkspaceEdit({
      edits: [
        {
          file: nestedFile,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 11 } },
          newText: "new content",
        },
      ],
    });

    expect(result.kind).toBe("applied");
    expect(readFileSync(nestedFile, "utf-8")).toBe("new content");
  });
});
