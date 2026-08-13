import { describe, expect, it, vi } from "vitest";
import { createTreeSitterService } from "../../src/session/session.ts";
import type { StructuralWorkerClient } from "../../src/session/structural-worker-client.ts";

describe("TreeSitterService request control", () => {
  it("forwards the exact control through every structural operation", async () => {
    const execute = vi.fn(async (_input: unknown, _control?: unknown) => ({
      kind: "success" as const,
      data: [],
    }));
    const service = createTreeSitterService({ execute } as unknown as StructuralWorkerClient);
    const control = { signal: new AbortController().signal, deadline: 42 };

    await service.canParse("test.ts", control);
    await service.query("test.ts", "(identifier) @id", control);
    await service.outline("test.ts", control);
    await service.imports("test.ts", control);
    await service.exports("test.ts", control);
    await service.nodeAt("test.ts", 1, 1, control);
    await service.calleesAt("test.ts", 1, 1, { depth: "deep", control });
    await service.callSites("test.ts", control);

    expect(execute.mock.calls.map(([input]) => input)).toEqual([
      { operation: "canParse", file: "test.ts" },
      { operation: "query", file: "test.ts", query: "(identifier) @id" },
      { operation: "outline", file: "test.ts" },
      { operation: "imports", file: "test.ts" },
      { operation: "exports", file: "test.ts" },
      { operation: "nodeAt", file: "test.ts", line: 1, character: 1 },
      { operation: "calleesAt", file: "test.ts", line: 1, character: 1, depth: "deep" },
      { operation: "callSites", file: "test.ts" },
    ]);
    expect(execute.mock.calls.every((call) => call[1] === control)).toBe(true);
  });
});
