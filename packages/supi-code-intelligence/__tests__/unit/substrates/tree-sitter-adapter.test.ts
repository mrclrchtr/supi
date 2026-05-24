import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionTreeSitterService: vi.fn(),
  createTreeSitterSession: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-tree-sitter/api", () => ({
  getSessionTreeSitterService: mocks.getSessionTreeSitterService,
  createTreeSitterSession: mocks.createTreeSitterSession,
}));

import { createStructuralSubstrate } from "../../../src/substrates/tree-sitter-adapter.ts";

function makeTsServiceStub() {
  return {
    calleesAt: vi.fn(),
    exports: vi.fn(),
    outline: vi.fn(),
    imports: vi.fn(),
    nodeAt: vi.fn(),
  };
}

describe("createStructuralSubstrate", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a StructuralSubstrate with all 5 methods", () => {
    mocks.getSessionTreeSitterService.mockReturnValue({
      kind: "ready",
      service: makeTsServiceStub(),
    });

    const substrate = createStructuralSubstrate("/project");

    expect(substrate).toBeDefined();
    expect(typeof substrate.calleesAt).toBe("function");
    expect(typeof substrate.exports).toBe("function");
    expect(typeof substrate.outline).toBe("function");
    expect(typeof substrate.imports).toBe("function");
    expect(typeof substrate.nodeAt).toBe("function");
  });

  describe("exports", () => {
    it("maps ExportRecord[] to ExportData[] (flattens range fields)", async () => {
      const ts = makeTsServiceStub();
      ts.exports.mockResolvedValue({
        kind: "success",
        data: [
          {
            name: "MyFunc",
            kind: "function",
            range: { startLine: 1, startCharacter: 0, endLine: 10, endCharacter: 1 },
            moduleSpecifier: undefined,
          },
          {
            name: "MyClass",
            kind: "class",
            range: { startLine: 12, startCharacter: 0, endLine: 30, endCharacter: 1 },
            moduleSpecifier: undefined,
          },
        ],
      });
      mocks.getSessionTreeSitterService.mockReturnValue({ kind: "ready", service: ts });

      const substrate = createStructuralSubstrate("/project");
      const result = await substrate.exports("/f.ts");

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.data).toHaveLength(2);
        expect(result.data[0]).toEqual({
          name: "MyFunc",
          kind: "function",
          startLine: 1,
          startCharacter: 0,
          endLine: 10,
          endCharacter: 1,
          moduleSpecifier: undefined,
        });
        expect(result.data[1].name).toBe("MyClass");
      }
    });

    it("passes through non-success result kinds unchanged", async () => {
      const ts = makeTsServiceStub();
      ts.exports.mockResolvedValue({
        kind: "unsupported-language",
        file: "/f.ts",
        message: "unsupported",
      });
      mocks.getSessionTreeSitterService.mockReturnValue({ kind: "ready", service: ts });

      const substrate = createStructuralSubstrate("/project");
      const result = await substrate.exports("/f.ts");

      expect(result.kind).toBe("unsupported-language");
      if (result.kind === "unsupported-language") {
        expect(result.message).toBe("unsupported");
      }
    });
  });

  describe("outline", () => {
    it("maps recursively including children", async () => {
      const ts = makeTsServiceStub();
      ts.outline.mockResolvedValue({
        kind: "success",
        data: [
          {
            name: "ClassA",
            kind: "class",
            range: { startLine: 1, startCharacter: 0, endLine: 20, endCharacter: 1 },
            children: [
              {
                name: "methodA",
                kind: "method",
                range: { startLine: 3, startCharacter: 2, endLine: 10, endCharacter: 3 },
              },
            ],
          },
        ],
      });
      mocks.getSessionTreeSitterService.mockReturnValue({ kind: "ready", service: ts });

      const substrate = createStructuralSubstrate("/project");
      const result = await substrate.outline("/f.ts");

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe("ClassA");
        expect(result.data[0].startLine).toBe(1);
        expect(result.data[0].children).toHaveLength(1);
        expect(result.data[0].children![0].name).toBe("methodA");
        expect(result.data[0].children![0].startLine).toBe(3);
      }
    });
  });

  describe("imports", () => {
    it("maps ImportRecord[] to ImportData[]", async () => {
      const ts = makeTsServiceStub();
      ts.imports.mockResolvedValue({
        kind: "success",
        data: [
          {
            moduleSpecifier: "fs",
            range: { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 15 },
          },
        ],
      });
      mocks.getSessionTreeSitterService.mockReturnValue({ kind: "ready", service: ts });

      const substrate = createStructuralSubstrate("/project");
      const result = await substrate.imports("/f.ts");

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.data[0]).toEqual({
          moduleSpecifier: "fs",
          startLine: 1,
          startCharacter: 0,
          endLine: 1,
          endCharacter: 15,
        });
      }
    });
  });

  describe("nodeAt", () => {
    it("maps NodeAtResult to NodeAtData", async () => {
      const ts = makeTsServiceStub();
      ts.nodeAt.mockResolvedValue({
        kind: "success",
        data: {
          type: "identifier",
          range: { startLine: 5, startCharacter: 10, endLine: 5, endCharacter: 15 },
          text: "foo",
          ancestry: [
            {
              type: "call_expression",
              range: { startLine: 5, startCharacter: 8, endLine: 5, endCharacter: 20 },
            },
          ],
        },
      });
      mocks.getSessionTreeSitterService.mockReturnValue({ kind: "ready", service: ts });

      const substrate = createStructuralSubstrate("/project");
      const result = await substrate.nodeAt("/f.ts", 5, 10);

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.data.type).toBe("identifier");
        expect(result.data.startLine).toBe(5);
        expect(result.data.ancestry).toHaveLength(1);
        expect(result.data.ancestry[0].type).toBe("call_expression");
      }
    });
  });

  describe("calleesAt", () => {
    it("maps CalleesAtResult to CalleesData", async () => {
      const ts = makeTsServiceStub();
      ts.calleesAt.mockResolvedValue({
        kind: "success",
        data: {
          enclosingScope: {
            name: "handleClick",
            range: { startLine: 10, startCharacter: 0, endLine: 20, endCharacter: 1 },
          },
          callees: [
            {
              name: "console.log",
              range: { startLine: 12, startCharacter: 4, endLine: 12, endCharacter: 20 },
            },
          ],
        },
      });
      mocks.getSessionTreeSitterService.mockReturnValue({ kind: "ready", service: ts });

      const substrate = createStructuralSubstrate("/project");
      const result = await substrate.calleesAt("/f.ts", 10, 0);

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.data.enclosingScope).toEqual({
          name: "handleClick",
          startLine: 10,
          endLine: 20,
        });
        expect(result.data.callees).toHaveLength(1);
        expect(result.data.callees[0]).toEqual({ name: "console.log", startLine: 12 });
      }
    });
  });

  describe("fallback session", () => {
    it("falls back to createTreeSitterSession when shared service is unavailable", async () => {
      const dispose = vi.fn();
      const session = { ...makeTsServiceStub(), dispose };
      session.exports.mockResolvedValue({ kind: "success", data: [] });
      mocks.getSessionTreeSitterService.mockReturnValue({
        kind: "unavailable",
        reason: "no session",
      });
      mocks.createTreeSitterSession.mockReturnValue(session);

      const substrate = createStructuralSubstrate("/project");
      const result = await substrate.exports("/f.ts");

      expect(result.kind).toBe("success");
      expect(mocks.createTreeSitterSession).toHaveBeenCalledWith("/project");
    });

    it("disposes fallback session after use", async () => {
      const dispose = vi.fn();
      const session = { ...makeTsServiceStub(), dispose };
      session.exports.mockResolvedValue({ kind: "success", data: [] });
      mocks.getSessionTreeSitterService.mockReturnValue({
        kind: "unavailable",
        reason: "no session",
      });
      mocks.createTreeSitterSession.mockReturnValue(session);

      const substrate = createStructuralSubstrate("/project");
      await substrate.exports("/f.ts");

      expect(dispose).toHaveBeenCalledOnce();
    });
  });

  describe("non-success results pass through", () => {
    const errorKinds = [
      { kind: "file-access-error", file: "/f.ts", message: "not found" },
      { kind: "validation-error", message: "bad query" },
      { kind: "runtime-error", message: "parse failed" },
    ];

    for (const error of errorKinds) {
      it(`passes through ${error.kind}`, async () => {
        const ts = makeTsServiceStub();
        ts.exports.mockResolvedValue(error);
        mocks.getSessionTreeSitterService.mockReturnValue({ kind: "ready", service: ts });

        const substrate = createStructuralSubstrate("/project");
        const result = await substrate.exports("/f.ts");

        expect(result).toEqual(error);
      });
    }
  });
});
