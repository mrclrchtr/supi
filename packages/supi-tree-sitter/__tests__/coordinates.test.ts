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

  it("handles non-ASCII characters (UTF-16 code units)", () => {
    const source = "héllo world";
    // 'h' is at UTF-16 index 0, 'é' is at index 1, 'l' is at index 2.
    // Character 3 (1-based) is 'l', column should be 2 (0-based).
    const result = publicToTreeSitter(1, 3, source);
    expect(result).toEqual({ row: 0, column: 2 });
  });

  it("clamps character to line length", () => {
    const result = publicToTreeSitter(1, 100, "hi");
    expect(result.column).toBe(2); // "hi" is 2 UTF-16 code units
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

  it("handles non-ASCII characters (UTF-16 code units)", () => {
    const source = "héllo";
    // 'h' is at UTF-16 index 0, 'é' is at index 1, column 2 (0-based)
    // is the first 'l'. So line 1 character should be 3.
    const result = treeSitterToPublic(0, 2, source);
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
