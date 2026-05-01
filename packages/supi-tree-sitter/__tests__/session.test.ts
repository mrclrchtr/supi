import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TreeSitterRuntime } from "../runtime.ts";

const mocks = vi.hoisted(() => {
  const instances: RuntimeMock[] = [];
  return {
    instances,
    extractExports: vi.fn(),
    extractImports: vi.fn(),
    extractOutline: vi.fn(),
    lookupNodeAt: vi.fn(),
  };
});

type RuntimeMock = {
  cwd: string;
  parseFile: ReturnType<typeof vi.fn>;
  queryFile: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};

vi.mock("../runtime.ts", () => ({
  TreeSitterRuntime: class {
    cwd: string;
    parseFile = vi.fn();
    queryFile = vi.fn();
    dispose = vi.fn();

    constructor(cwd: string) {
      this.cwd = cwd;
      mocks.instances.push(this as RuntimeMock);
    }
  },
}));

vi.mock("../structure.ts", () => ({
  extractExports: mocks.extractExports,
  extractImports: mocks.extractImports,
  extractOutline: mocks.extractOutline,
  lookupNodeAt: mocks.lookupNodeAt,
}));

async function importSessionFactory() {
  const mod = await import("../session.ts");
  return mod.createTreeSitterSession;
}

function createParsedTree() {
  return {
    rootNode: { type: "program" },
    delete: vi.fn(),
  };
}

describe("createTreeSitterSession", () => {
  beforeEach(() => {
    mocks.instances.length = 0;
    mocks.extractExports.mockReset();
    mocks.extractImports.mockReset();
    mocks.extractOutline.mockReset();
    mocks.lookupNodeAt.mockReset();
  });

  it("delegates parse and deletes the parse tree", async () => {
    const createTreeSitterSession = await importSessionFactory();
    const session = createTreeSitterSession("/repo");
    const runtime = mocks.instances[0];
    const tree = createParsedTree();
    runtime?.parseFile.mockResolvedValue({
      kind: "success",
      data: { tree, source: "", resolvedPath: "/repo/sample.ts", grammarId: "typescript" },
    });

    const result = await session.parse("sample.ts");

    expect(result).toEqual({
      kind: "success",
      data: { file: "/repo/sample.ts", language: "typescript" },
    });
    expect(runtime?.parseFile).toHaveBeenCalledWith("sample.ts");
    expect(tree.delete).toHaveBeenCalledOnce();
  });

  it("delegates query, imports, exports, and nodeAt", async () => {
    const createTreeSitterSession = await importSessionFactory();
    const session = createTreeSitterSession("/repo");
    const runtime = mocks.instances[0] as unknown as TreeSitterRuntime;
    mocks.instances[0]?.queryFile.mockResolvedValue({ kind: "success", data: [] });
    mocks.extractImports.mockResolvedValue({ kind: "success", data: [] });
    mocks.extractExports.mockResolvedValue({ kind: "success", data: [] });
    mocks.lookupNodeAt.mockResolvedValue({
      kind: "success",
      data: { type: "identifier", range: range(), text: "x", ancestry: [] },
    });

    await session.query("sample.ts", "(identifier) @id");
    await session.imports("sample.ts");
    await session.exports("sample.ts");
    await session.nodeAt("sample.ts", 1, 2);

    expect(mocks.instances[0]?.queryFile).toHaveBeenCalledWith("sample.ts", "(identifier) @id");
    expect(mocks.extractImports).toHaveBeenCalledWith(runtime, "sample.ts");
    expect(mocks.extractExports).toHaveBeenCalledWith(runtime, "sample.ts");
    expect(mocks.lookupNodeAt).toHaveBeenCalledWith(runtime, "sample.ts", 1, 2);
  });

  it("delegates outline and deletes the parse tree", async () => {
    const createTreeSitterSession = await importSessionFactory();
    const session = createTreeSitterSession("/repo");
    const runtime = mocks.instances[0];
    const tree = createParsedTree();
    runtime?.parseFile.mockResolvedValue({
      kind: "success",
      data: { tree, source: "source", resolvedPath: "/repo/sample.ts", grammarId: "typescript" },
    });
    mocks.extractOutline.mockReturnValue([{ name: "x", kind: "function", range: range() }]);

    const result = await session.outline("sample.ts");

    expect(result.kind).toBe("success");
    expect(mocks.extractOutline).toHaveBeenCalledWith(tree.rootNode, "source");
    expect(tree.delete).toHaveBeenCalledOnce();
  });

  it("disposes the runtime", async () => {
    const createTreeSitterSession = await importSessionFactory();
    const session = createTreeSitterSession("/repo");
    const runtime = mocks.instances[0];

    session.dispose();

    expect(runtime?.dispose).toHaveBeenCalledOnce();
  });
});

function range() {
  return { startLine: 1, startCharacter: 1, endLine: 1, endCharacter: 2 };
}
