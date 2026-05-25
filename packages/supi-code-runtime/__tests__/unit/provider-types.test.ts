import { describe, expect, it } from "vitest";
import type {
  CalleesData,
  CodeLocation,
  CodePosition,
  CodeResult,
  ExportData,
  ImportData,
  NodeAtData,
  OutlineData,
  SemanticProvider,
  StructuralProvider,
} from "../../src/api.ts";

describe("SemanticProvider contract", () => {
  it("type-checks a minimal implementation", () => {
    const provider: SemanticProvider = {
      references: async (_file, _pos) => null,
      implementation: async (_file, _pos) => null,
      documentSymbols: async (_file) => null,
      workspaceSymbols: async (_query) => null,
    };
    expect(typeof provider.references).toBe("function");
  });
});

describe("StructuralProvider contract", () => {
  it("type-checks a minimal implementation", () => {
    const provider: StructuralProvider = {
      calleesAt: async (_f, _l, _c) => ({ kind: "unavailable", message: "not implemented" }),
      exports: async (_f) => ({ kind: "unavailable", message: "not implemented" }),
      outline: async (_f) => ({ kind: "unavailable", message: "not implemented" }),
      imports: async (_f) => ({ kind: "unavailable", message: "not implemented" }),
      nodeAt: async (_f, _l, _c) => ({ kind: "unavailable", message: "not implemented" }),
    };
    expect(typeof provider.calleesAt).toBe("function");
  });
});

describe("CodeResult discriminated union", () => {
  it("discriminates success", () => {
    const result: CodeResult<string> = { kind: "success", data: "hello" };
    if (result.kind === "success") {
      expect(result.data).toBe("hello");
    }
  });

  it("discriminates unsupported-language", () => {
    const result: CodeResult<unknown> = {
      kind: "unsupported-language",
      file: "test.py",
      message: "not supported",
    };
    if (result.kind === "unsupported-language") {
      expect(result.file).toBe("test.py");
    }
  });

  it("discriminates file-access-error", () => {
    const result: CodeResult<unknown> = {
      kind: "file-access-error",
      file: "missing.ts",
      message: "ENOENT",
    };
    if (result.kind === "file-access-error") {
      expect(result.file).toBe("missing.ts");
    }
  });

  it("discriminates validation-error", () => {
    const result: CodeResult<unknown> = {
      kind: "validation-error",
      message: "invalid input",
    };
    if (result.kind === "validation-error") {
      expect(result.message).toBe("invalid input");
    }
  });

  it("discriminates runtime-error", () => {
    const result: CodeResult<unknown> = {
      kind: "runtime-error",
      message: "crash",
    };
    if (result.kind === "runtime-error") {
      expect(result.message).toBe("crash");
    }
  });

  it("discriminates unavailable", () => {
    const result: CodeResult<unknown> = {
      kind: "unavailable",
      message: "no server",
    };
    if (result.kind === "unavailable") {
      expect(result.message).toBe("no server");
    }
  });
});

describe("CodePosition", () => {
  it("carries line and character", () => {
    const pos: CodePosition = { line: 5, character: 12 };
    expect(pos.line).toBe(5);
    expect(pos.character).toBe(12);
  });
});

describe("CodeLocation", () => {
  it("carries uri and range", () => {
    const loc: CodeLocation = {
      uri: "file:///test.ts",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 10, character: 5 },
      },
    };
    expect(loc.uri).toBe("file:///test.ts");
    expect(loc.range.start.line).toBe(0);
  });
});

describe("Structural data shapes", () => {
  it("OutlineData carries flattened range", () => {
    const data: OutlineData = {
      name: "foo",
      kind: "function",
      startLine: 1,
      startCharacter: 0,
      endLine: 10,
      endCharacter: 20,
    };
    expect(data.name).toBe("foo");
  });

  it("ExportData includes optional moduleSpecifier", () => {
    const reExport: ExportData = {
      name: "bar",
      kind: "variable",
      startLine: 3,
      startCharacter: 0,
      endLine: 3,
      endCharacter: 10,
      moduleSpecifier: "./helper",
    };
    expect(reExport.moduleSpecifier).toBe("./helper");

    const direct: ExportData = {
      name: "baz",
      kind: "function",
      startLine: 1,
      startCharacter: 0,
      endLine: 1,
      endCharacter: 5,
    };
    expect(direct.moduleSpecifier).toBeUndefined();
  });

  it("CalleesData carries enclosing scope and callee list", () => {
    const data: CalleesData = {
      enclosingScope: { name: "myFunc", startLine: 1, endLine: 20 },
      callees: [{ name: "helper", startLine: 5 }],
    };
    expect(data.enclosingScope.name).toBe("myFunc");
    expect(data.callees).toHaveLength(1);
  });

  it("NodeAtData carries ancestry", () => {
    const data: NodeAtData = {
      type: "identifier",
      startLine: 5,
      startCharacter: 10,
      endLine: 5,
      endCharacter: 15,
      text: "foo",
      ancestry: [
        {
          type: "expression_statement",
          startLine: 5,
          startCharacter: 0,
          endLine: 5,
          endCharacter: 20,
        },
      ],
    };
    expect(data.type).toBe("identifier");
    expect(data.ancestry).toHaveLength(1);
  });

  it("ImportData carries moduleSpecifier and range", () => {
    const data: ImportData = {
      moduleSpecifier: "fs",
      startLine: 1,
      startCharacter: 0,
      endLine: 1,
      endCharacter: 15,
    };
    expect(data.moduleSpecifier).toBe("fs");
  });
});
