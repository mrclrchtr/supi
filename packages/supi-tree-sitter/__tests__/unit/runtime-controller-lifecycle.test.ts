import { describe, expect, it, vi } from "vitest";
import type { TreeSitterSession } from "../../src/types.ts";

const mocks = vi.hoisted(() => ({
  dispose: vi.fn(async () => undefined),
  canParse: vi.fn(async () => ({ kind: "runtime-error", message: "startup failed" })),
}));

vi.mock("../../src/session/session.ts", () => ({
  createTreeSitterSession: () =>
    ({
      canParse: mocks.canParse,
      dispose: mocks.dispose,
    }) as unknown as TreeSitterSession,
}));

import { TreeSitterRuntimeController } from "../../src/session/runtime-controller.ts";

describe("TreeSitterRuntimeController failed initialization", () => {
  it("awaits session disposal when Worker validation fails", async () => {
    const controller = new TreeSitterRuntimeController("/project");

    await expect(controller.start()).resolves.toEqual({
      kind: "unavailable",
      reason: "startup failed",
    });
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(controller.service).toBeNull();
  });
});
