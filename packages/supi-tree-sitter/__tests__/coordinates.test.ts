import { describe, expect, it } from "vitest";
import { nodeToRange, publicToTreeSitter, treeSitterToPublic } from "../src/coordinates.ts";

describe("publicToTreeSitter", () => {
  it("converts 1-based line 1 char 1 to row 0 column 0", () => {
    const result = publicToTreeSitter(1, 1, "hello");
    expect(result).toEqual({ row: 0, column: 0 });
  });

  it("converts line 1 char 5 to column 4", () => {
    const result = publicToTreeSitter(1, 5, "hello");
    expect(result).toEqual({ row: 0, column: 4 });
  });

  it("handles multi-line source", () => {
    const source = "line1\nline2\nline3";
    const result = publicToTreeSitter(2, 3, source);
    expect(result).toEqual({ row: 1, column: 2 });
  });

  it("handles non-ASCII characters (UTF-8 byte conversion)", () => {
    const source = "héllo world";
    // 'h' = 1 byte, 'é' = 2 bytes → byte offset at char 3 (1-based) = 3 bytes
    const result = publicToTreeSitter(1, 3, source);
    expect(result).toEqual({ row: 0, column: 3 });
  });

  it("clamps character to line length", () => {
    const result = publicToTreeSitter(1, 100, "hi");
    expect(result.column).toBe(2); // "hi" is 2 bytes
  });
});

describe("treeSitterToPublic", () => {
  it("converts row 0 column 0 to line 1 char 1", () => {
    const result = treeSitterToPublic(0, 0, "hello");
    expect(result).toEqual({ line: 1, character: 1 });
  });

  it("converts row 1 column 2 to line 2 char 3", () => {
    const result = treeSitterToPublic(1, 2, "line1\nline2");
    expect(result).toEqual({ line: 2, character: 3 });
  });

  it("handles non-ASCII byte-to-char conversion", () => {
    const source = "héllo";
    // 'h' = 1 byte, 'é' = 2 bytes → byte offset 3 is at UTF-16 index 2 (after 'h', 'é')
    const result = treeSitterToPublic(0, 3, source);
    expect(result).toEqual({ line: 1, character: 3 });
  });
});

describe("nodeToRange", () => {
  it("converts a node with simple positions", () => {
    const node = {
      startPosition: { row: 0, column: 0 },
      endPosition: { row: 0, column: 5 },
    };
    const range = nodeToRange(node, "hello");
    expect(range).toEqual({
      startLine: 1,
      startCharacter: 1,
      endLine: 1,
      endCharacter: 6,
    });
  });

  it("handles multi-line ranges", () => {
    const source = "line1\nline2\n";
    const node = {
      startPosition: { row: 0, column: 0 },
      endPosition: { row: 1, column: 5 },
    };
    const range = nodeToRange(node, source);
    expect(range).toEqual({
      startLine: 1,
      startCharacter: 1,
      endLine: 2,
      endCharacter: 6,
    });
  });
});
