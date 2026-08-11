import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyWorkspaceEdit } from "../../../../src/analysis/refactor/apply.ts";

describe("LSP text-edit application", () => {
  let tmpDir: string;
  let file: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "text-edit-conformance-"));
    file = path.join(tmpDir, "source.ts");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("keeps protocol order for inserts at the same position", async () => {
    writeFileSync(file, "left right");

    const result = await applyWorkspaceEdit({
      edits: [
        {
          file,
          range: { start: { line: 0, character: 5 }, end: { line: 0, character: 5 } },
          newText: "first ",
        },
        {
          file,
          range: { start: { line: 0, character: 5 }, end: { line: 0, character: 5 } },
          newText: "second ",
        },
      ],
    });

    expect(result.kind).toBe("applied");
    expect(readFileSync(file, "utf-8")).toBe("left first second right");
  });

  it("applies ordered inserts before a replacement at the same position", async () => {
    writeFileSync(file, "left old right");

    const result = await applyWorkspaceEdit({
      edits: [
        {
          file,
          range: { start: { line: 0, character: 5 }, end: { line: 0, character: 5 } },
          newText: "first ",
        },
        {
          file,
          range: { start: { line: 0, character: 5 }, end: { line: 0, character: 5 } },
          newText: "second ",
        },
        {
          file,
          range: { start: { line: 0, character: 5 }, end: { line: 0, character: 8 } },
          newText: "new",
        },
      ],
    });

    expect(result.kind).toBe("applied");
    expect(readFileSync(file, "utf-8")).toBe("left first second new right");
  });

  it("rejects a replacement before an insert at the same position", async () => {
    const original = "left old right";
    writeFileSync(file, original);

    const result = await applyWorkspaceEdit({
      edits: [
        {
          file,
          range: { start: { line: 0, character: 5 }, end: { line: 0, character: 8 } },
          newText: "new",
        },
        {
          file,
          range: { start: { line: 0, character: 5 }, end: { line: 0, character: 5 } },
          newText: "first ",
        },
      ],
    });

    expect(result.kind).toBe("error");
    expect(readFileSync(file, "utf-8")).toBe(original);
  });

  it("rejects overlapping ranges before changing the file", async () => {
    const original = "left old right";
    writeFileSync(file, original);

    const result = await applyWorkspaceEdit({
      edits: [
        {
          file,
          range: { start: { line: 0, character: 5 }, end: { line: 0, character: 8 } },
          newText: "new",
        },
        {
          file,
          range: { start: { line: 0, character: 6 }, end: { line: 0, character: 9 } },
          newText: "other",
        },
      ],
    });

    expect(result.kind).toBe("error");
    expect(readFileSync(file, "utf-8")).toBe(original);
  });

  it.each([
    ["LF", "\n"],
    ["CRLF", "\r\n"],
    ["CR", "\r"],
  ])("uses logical lines and preserves unrelated %s bytes", async (_name, eol) => {
    const original = `alpha${eol}bravo${eol}charlie`;
    writeFileSync(file, original);

    const result = await applyWorkspaceEdit({
      edits: [
        {
          file,
          range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
          newText: "B",
        },
      ],
    });

    expect(result.kind).toBe("applied");
    expect(readFileSync(file, "utf-8")).toBe(`alpha${eol}B${eol}charlie`);
  });

  it("rejects a position inside a CRLF sequence", async () => {
    const original = "alpha\r\nbravo";
    writeFileSync(file, original);

    const result = await applyWorkspaceEdit({
      edits: [
        {
          file,
          range: { start: { line: 0, character: 6 }, end: { line: 0, character: 6 } },
          newText: "X",
        },
      ],
    });

    expect(result.kind).toBe("error");
    expect(readFileSync(file, "utf-8")).toBe(original);
  });

  it("uses UTF-16 columns before and after a supplementary character", async () => {
    writeFileSync(file, "A😀B");

    const result = await applyWorkspaceEdit({
      edits: [
        {
          file,
          range: { start: { line: 0, character: 1 }, end: { line: 0, character: 1 } },
          newText: "<",
        },
        {
          file,
          range: { start: { line: 0, character: 3 }, end: { line: 0, character: 3 } },
          newText: ">",
        },
      ],
    });

    expect(result.kind).toBe("applied");
    expect(readFileSync(file, "utf-8")).toBe("A<😀>B");
  });
});
