import { describe, expect, it, vi } from "vitest";
import type { TreeSitterRuntime } from "../../src/session/runtime.ts";

const mocks = vi.hoisted(() => ({
  extractCallSites: vi.fn(async () => ({ kind: "success", data: [] })),
  extractExports: vi.fn(async () => ({ kind: "success", data: [] })),
  extractImports: vi.fn(async () => ({ kind: "success", data: [] })),
  lookupCalleesAt: vi.fn(async () => ({ kind: "runtime-error", message: "test" })),
  lookupNodeAt: vi.fn(async () => ({ kind: "runtime-error", message: "test" })),
  extractOutline: vi.fn(() => []),
}));

vi.mock("../../src/tool/structure.ts", () => mocks);

import { createTreeSitterService } from "../../src/session/session.ts";

describe("TreeSitterService request control", () => {
  it("forwards the exact control through every structural operation", async () => {
    const canonicalTree = {
      rootNode: {},
      delete: vi.fn(),
      copy: vi.fn(),
    };
    const runtime = {
      parseFile: vi.fn(async () => ({
        kind: "success",
        data: {
          tree: canonicalTree,
          source: "const value = 1;",
          resolvedPath: "/project/test.ts",
          grammarId: "typescript",
        },
      })),
      queryFile: vi.fn(async () => ({ kind: "success", data: [] })),
    } as unknown as TreeSitterRuntime;
    const service = createTreeSitterService(runtime);
    const control = { signal: new AbortController().signal, deadline: 42 };

    await service.canParse("test.ts", control);
    await service.query("test.ts", "(identifier) @id", control);
    await service.outline("test.ts", control);
    await service.imports("test.ts", control);
    await service.exports("test.ts", control);
    await service.nodeAt("test.ts", 1, 1, control);
    await service.calleesAt("test.ts", 1, 1, { depth: "deep", control });
    await service.callSites("test.ts", control);

    expect(runtime.parseFile).toHaveBeenNthCalledWith(1, "test.ts", control);
    expect(runtime.queryFile).toHaveBeenCalledWith("test.ts", "(identifier) @id", control);
    expect(runtime.parseFile).toHaveBeenNthCalledWith(2, "test.ts", control);
    for (const mock of [
      mocks.extractImports,
      mocks.extractExports,
      mocks.lookupNodeAt,
      mocks.lookupCalleesAt,
      mocks.extractCallSites,
    ]) {
      const call = mock.mock.calls[0];
      expect(call?.at(-1)).toBe(control);
    }
  });
});
