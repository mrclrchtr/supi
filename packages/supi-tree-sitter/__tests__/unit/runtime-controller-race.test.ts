import { WorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TreeSitterSession } from "../../src/types.ts";

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  if (!resolve) throw new Error("Deferred promise was not initialized");
  return { promise, resolve };
}

const mocks = vi.hoisted(() => ({
  probes: [] as Array<Deferred<{ kind: "success"; data: { file: string; language: string } }>>,
  sessions: [] as Array<{ canParse: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>,
}));

vi.mock("../../src/session/session.ts", () => ({
  createTreeSitterSession: () => {
    const probe = mocks.probes.shift();
    if (!probe) throw new Error("No deferred probe configured");
    const session = {
      canParse: vi.fn(() => probe.promise),
      dispose: vi.fn(async () => undefined),
    };
    mocks.sessions.push(session);
    return session as unknown as TreeSitterSession;
  },
}));

import { TreeSitterRuntimeController } from "../../src/session/runtime-controller.ts";

beforeEach(() => {
  mocks.probes.length = 0;
  mocks.sessions.length = 0;
});

describe("TreeSitterRuntimeController startup races", () => {
  it("does not publish when shutdown wins during startup", async () => {
    const probe = deferred<{ kind: "success"; data: { file: string; language: string } }>();
    mocks.probes.push(probe);
    const runtime = new WorkspaceRuntime();
    const controller = new TreeSitterRuntimeController("/project", runtime);

    const pending = controller.start();
    await vi.waitFor(() => expect(mocks.sessions).toHaveLength(1));
    await controller.shutdown();
    probe.resolve({ kind: "success", data: { file: "probe.ts", language: "typescript" } });

    await expect(pending).resolves.toEqual({ kind: "unavailable", reason: "Startup superseded" });
    expect(mocks.sessions[0]?.dispose).toHaveBeenCalledOnce();
    expect(runtime.getWorkspace("/project").structural.provider).toBeNull();
    expect(controller.kind).toBe("initial");
  });

  it("publishes only the newest overlapping startup", async () => {
    const firstProbe = deferred<{ kind: "success"; data: { file: string; language: string } }>();
    const secondProbe = deferred<{ kind: "success"; data: { file: string; language: string } }>();
    mocks.probes.push(firstProbe, secondProbe);
    const runtime = new WorkspaceRuntime();
    const controller = new TreeSitterRuntimeController("/project", runtime);

    const first = controller.start();
    await vi.waitFor(() => expect(mocks.sessions).toHaveLength(1));
    const second = controller.start();
    firstProbe.resolve({ kind: "success", data: { file: "probe.ts", language: "typescript" } });
    await vi.waitFor(() => expect(mocks.sessions).toHaveLength(2));
    secondProbe.resolve({ kind: "success", data: { file: "probe.ts", language: "typescript" } });
    await expect(second).resolves.toEqual({ kind: "ready" });

    await expect(first).resolves.toEqual({ kind: "unavailable", reason: "Startup superseded" });
    expect(mocks.sessions[0]?.dispose).toHaveBeenCalledOnce();
    expect(mocks.sessions[1]?.dispose).not.toHaveBeenCalled();
    expect(runtime.getWorkspace("/project").structural.provider).not.toBeNull();
    expect(controller.service).toBe(mocks.sessions[1]);
    await controller.shutdown();
  });
});
