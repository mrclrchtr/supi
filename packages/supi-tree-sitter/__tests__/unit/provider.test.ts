import type { StructuralProvider } from "@mrclrchtr/supi-code-intelligence/api";
import { describe, expect, it } from "vitest";
import { createTreeSitterProvider } from "../../src/provider/tree-sitter-provider.ts";
import type {
  CalleesAtResult,
  ExportRecord,
  ImportRecord,
  NodeAtResult,
  OutlineItem,
  QueryCapture,
  TreeSitterService,
} from "../../src/types.ts";

// ── Mock helpers ──────────────────────────────────────────────────────

function mockService(overrides?: Partial<TreeSitterService>): TreeSitterService {
  return {
    canParse:
      overrides?.canParse ??
      (async () => ({ kind: "success", data: { file: "", language: "typescript" } })),
    query:
      overrides?.query ??
      (async () => {
        const result: { kind: "success"; data: QueryCapture[] } = { kind: "success", data: [] };
        return result;
      }),
    outline: overrides?.outline ?? (async () => ({ kind: "success", data: [] as OutlineItem[] })),
    imports: overrides?.imports ?? (async () => ({ kind: "success", data: [] as ImportRecord[] })),
    exports: overrides?.exports ?? (async () => ({ kind: "success", data: [] as ExportRecord[] })),
    nodeAt:
      overrides?.nodeAt ??
      (async () => ({
        kind: "success",
        data: {
          type: "program",
          range: { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 0 },
          text: "",
          ancestry: [],
        } satisfies NodeAtResult,
      })),
    calleesAt:
      overrides?.calleesAt ??
      (async () => ({
        kind: "success",
        data: {
          enclosingScope: {
            name: "root",
            range: { startLine: 1, startCharacter: 0, endLine: 10, endCharacter: 0 },
          },
          callees: [],
        } satisfies CalleesAtResult,
      })),
  };
}

describe("TreeSitterProvider", () => {
  it("creates a StructuralProvider from a TreeSitterService", () => {
    const service = mockService();
    const provider: StructuralProvider = createTreeSitterProvider(service);
    expect(typeof provider.outline).toBe("function");
    expect(typeof provider.exports).toBe("function");
    expect(typeof provider.imports).toBe("function");
    expect(typeof provider.nodeAt).toBe("function");
    expect(typeof provider.calleesAt).toBe("function");
  });

  describe("outline", () => {
    it("maps success results", async () => {
      const service = mockService({
        outline: async () => ({
          kind: "success" as const,
          data: [
            {
              name: "foo",
              kind: "function",
              range: { startLine: 1, startCharacter: 0, endLine: 10, endCharacter: 20 },
              children: [
                {
                  name: "bar",
                  kind: "parameter",
                  range: { startLine: 1, startCharacter: 4, endLine: 1, endCharacter: 7 },
                },
              ],
            },
          ] satisfies OutlineItem[],
        }),
      });
      const provider = createTreeSitterProvider(service);
      const result = await provider.outline("test.ts");

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe("foo");
        // Flat fields should be mapped from nested range
        expect(result.data[0].startLine).toBe(1);
        expect(result.data[0].endCharacter).toBe(20);
        // Children should also be mapped
        expect(result.data[0].children).toHaveLength(1);
        expect(result.data[0].children?.[0].name).toBe("bar");
        expect(result.data[0].children?.[0].startLine).toBe(1);
      }
    });

    it("passes through unsupported-language errors", async () => {
      const service = mockService({
        outline: async () => ({
          kind: "unsupported-language" as const,
          file: "test.py",
          message: "not supported",
        }),
      });
      const provider = createTreeSitterProvider(service);
      const result = await provider.outline("test.py");

      expect(result.kind).toBe("unsupported-language");
      if (result.kind === "unsupported-language") {
        expect(result.file).toBe("test.py");
      }
    });

    it("passes through file-access errors", async () => {
      const service = mockService({
        outline: async () => ({
          kind: "file-access-error" as const,
          file: "missing.ts",
          message: "ENOENT",
        }),
      });
      const provider = createTreeSitterProvider(service);
      const result = await provider.outline("missing.ts");

      expect(result.kind).toBe("file-access-error");
      if (result.kind === "file-access-error") {
        expect(result.file).toBe("missing.ts");
      }
    });
  });

  describe("exports", () => {
    it("maps success results with moduleSpecifier", async () => {
      const service = mockService({
        exports: async () => ({
          kind: "success" as const,
          data: [
            {
              name: "myFunc",
              kind: "function",
              range: { startLine: 5, startCharacter: 0, endLine: 5, endCharacter: 10 },
              moduleSpecifier: undefined,
            },
            {
              name: "Helper",
              kind: "class",
              range: { startLine: 10, startCharacter: 0, endLine: 30, endCharacter: 1 },
              moduleSpecifier: "./helper",
            },
          ] satisfies ExportRecord[],
        }),
      });
      const provider = createTreeSitterProvider(service);
      const result = await provider.exports("test.ts");

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.data).toHaveLength(2);
        // Direct export: moduleSpecifier should be undefined
        expect(result.data[0].moduleSpecifier).toBeUndefined();
        // Re-export: moduleSpecifier preserved
        expect(result.data[1].moduleSpecifier).toBe("./helper");
        // Flat range fields
        expect(result.data[0].startLine).toBe(5);
      }
    });
  });

  describe("imports", () => {
    it("maps success results", async () => {
      const service = mockService({
        imports: async () => ({
          kind: "success" as const,
          data: [
            {
              moduleSpecifier: "fs",
              range: { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 15 },
            },
          ] satisfies ImportRecord[],
        }),
      });
      const provider = createTreeSitterProvider(service);
      const result = await provider.imports("test.ts");

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.data[0].moduleSpecifier).toBe("fs");
        expect(result.data[0].startLine).toBe(1);
      }
    });
  });

  describe("nodeAt", () => {
    it("maps success results", async () => {
      const service = mockService({
        nodeAt: async () => ({
          kind: "success" as const,
          data: {
            type: "identifier",
            range: { startLine: 5, startCharacter: 10, endLine: 5, endCharacter: 15 },
            text: "foo",
            ancestry: [
              {
                type: "expression_statement",
                range: { startLine: 5, startCharacter: 0, endLine: 5, endCharacter: 20 },
              },
            ],
          } satisfies NodeAtResult,
        }),
      });
      const provider = createTreeSitterProvider(service);
      const result = await provider.nodeAt("test.ts", 5, 10);

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.data.type).toBe("identifier");
        expect(result.data.text).toBe("foo");
        expect(result.data.startLine).toBe(5);
        expect(result.data.ancestry).toHaveLength(1);
        expect(result.data.ancestry[0].type).toBe("expression_statement");
      }
    });
  });

  describe("calleesAt", () => {
    it("maps success results", async () => {
      const service = mockService({
        calleesAt: async () => ({
          kind: "success" as const,
          data: {
            enclosingScope: {
              name: "myFunc",
              range: { startLine: 1, startCharacter: 0, endLine: 20, endCharacter: 0 },
            },
            callees: [
              {
                name: "helper",
                range: { startLine: 5, startCharacter: 0, endLine: 5, endCharacter: 10 },
              },
            ],
          } satisfies CalleesAtResult,
        }),
      });
      const provider = createTreeSitterProvider(service);
      const result = await provider.calleesAt("test.ts", 5, 10);

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.data.enclosingScope.name).toBe("myFunc");
        expect(result.data.enclosingScope.startLine).toBe(1);
        expect(result.data.callees[0].name).toBe("helper");
        expect(result.data.callees[0].startLine).toBe(5);
      }
    });
  });

  describe("error passthrough", () => {
    it("maps validation errors", async () => {
      const service = mockService({
        nodeAt: async () => ({
          kind: "validation-error" as const,
          message: "invalid position",
        }),
      });
      const provider = createTreeSitterProvider(service);
      const result = await provider.nodeAt("test.ts", 0, 0);

      expect(result.kind).toBe("validation-error");
      if (result.kind === "validation-error") {
        expect(result.message).toBe("invalid position");
      }
    });

    it("maps runtime errors", async () => {
      const service = mockService({
        exports: async () => ({
          kind: "runtime-error" as const,
          message: "parser crash",
        }),
      });
      const provider = createTreeSitterProvider(service);
      const result = await provider.exports("test.ts");

      expect(result.kind).toBe("runtime-error");
      if (result.kind === "runtime-error") {
        expect(result.message).toBe("parser crash");
      }
    });
  });
});
