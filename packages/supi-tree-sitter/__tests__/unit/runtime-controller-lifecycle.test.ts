import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const runtimes: Array<{
    ensureGrammarParser: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];
  return {
    runtimes,
    createTreeSitterService: vi.fn(() => {
      throw new Error("service initialization failed");
    }),
  };
});

vi.mock("../../src/session/runtime.ts", () => ({
  TreeSitterRuntime: class {
    ensureGrammarParser = vi.fn(async () => ({ parser: {}, language: {} }));
    dispose = vi.fn();

    constructor() {
      mocks.runtimes.push(this);
    }
  },
}));

vi.mock("../../src/session/session.ts", () => ({
  createTreeSitterService: mocks.createTreeSitterService,
}));

import { TreeSitterRuntimeController } from "../../src/session/runtime-controller.ts";

describe("TreeSitterRuntimeController failed initialization", () => {
  it("disposes the runtime when setup fails after grammar initialization", async () => {
    const controller = new TreeSitterRuntimeController("/project");

    const result = await controller.start();

    expect(result).toEqual({ kind: "unavailable", reason: "service initialization failed" });
    expect(mocks.runtimes[0]?.ensureGrammarParser).toHaveBeenCalledWith("javascript");
    expect(mocks.runtimes[0]?.dispose).toHaveBeenCalledOnce();
    expect(controller.kind).toBe("unavailable");
  });
});
