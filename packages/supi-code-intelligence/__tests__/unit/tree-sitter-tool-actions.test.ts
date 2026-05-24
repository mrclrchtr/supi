import { describe, expect, it, vi } from "vitest";
import {
  executeExports,
  executeImports,
  executeOutline,
} from "../../src/tree-sitter/tool-actions.ts";

describe("tree-sitter tool actions — validation", () => {
  it("executeOutline returns unsupported language for non-JS/TS", async () => {
    const service = {
      outline: vi.fn(async () => ({
        kind: "unsupported-language" as const,
        file: "test.py",
        message: "outline is not supported for python files",
      })),
    } as never;
    const result = await executeOutline(service, "test.py");
    expect(result).toContain("Unsupported language");
  });

  it("executeImports returns no-imports message on empty result", async () => {
    const service = {
      imports: vi.fn(async () => ({ kind: "success" as const, data: [] })),
    } as never;
    const result = await executeImports(service, "test.ts");
    expect(result).toContain("No imports found");
  });

  it("executeExports returns no-exports message on empty result", async () => {
    const service = {
      exports: vi.fn(async () => ({ kind: "success" as const, data: [] })),
    } as never;
    const result = await executeExports(service, "test.ts");
    expect(result).toContain("No exports found");
  });

  it("executeOutline formats a successful result", async () => {
    const service = {
      outline: vi.fn(async () => ({
        kind: "success" as const,
        data: [
          {
            name: "foo",
            kind: "function",
            range: { startLine: 1, startCharacter: 0, endLine: 5, endCharacter: 0 },
          },
          {
            name: "Bar",
            kind: "class",
            range: { startLine: 10, startCharacter: 0, endLine: 20, endCharacter: 0 },
          },
        ],
      })),
    } as never;
    const result = await executeOutline(service, "test.ts");
    expect(result).toContain("foo");
    expect(result).toContain("Bar");
    expect(result).toContain("Outline");
  });
});
