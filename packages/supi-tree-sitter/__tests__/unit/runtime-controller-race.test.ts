import { beforeEach, describe, expect, it, vi } from "vitest";

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
  initializations: [] as Array<ReturnType<typeof deferred<unknown>>>,
  runtimes: [] as Array<{
    ensureGrammarParser: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
  published: vi.fn(),
  cleared: vi.fn(),
}));

vi.mock("../../src/session/runtime.ts", () => ({
  TreeSitterRuntime: class {
    ensureGrammarParser = vi.fn(() => {
      const next = mocks.initializations.shift();
      if (!next) throw new Error("No deferred initialization configured");
      return next.promise;
    });
    dispose = vi.fn();

    constructor() {
      mocks.runtimes.push(this);
    }
  },
}));

vi.mock("../../src/session/session.ts", () => ({
  createTreeSitterService: vi.fn((runtime) => ({ runtime })),
}));

vi.mock("../../src/session/service-registry.ts", () => ({
  setSessionTreeSitterService: mocks.published,
  clearSessionTreeSitterService: mocks.cleared,
}));

import { TreeSitterRuntimeController } from "../../src/session/runtime-controller.ts";

beforeEach(() => {
  mocks.initializations.length = 0;
  mocks.runtimes.length = 0;
  mocks.published.mockClear();
  mocks.cleared.mockClear();
});

describe("TreeSitterRuntimeController startup races", () => {
  it("does not publish when shutdown wins during startup", async () => {
    const initialization = deferred<unknown>();
    mocks.initializations.push(initialization);
    const controller = new TreeSitterRuntimeController("/project");

    const pending = controller.start();
    await vi.waitFor(() => expect(mocks.runtimes).toHaveLength(1));
    await controller.shutdown();
    initialization.resolve({ parser: {}, language: {} });

    await expect(pending).resolves.toEqual({ kind: "unavailable", reason: "Startup superseded" });
    expect(mocks.runtimes[0]?.dispose).toHaveBeenCalledOnce();
    expect(mocks.published).not.toHaveBeenCalled();
    expect(controller.kind).toBe("initial");
  });

  it("publishes only the newest overlapping startup", async () => {
    const firstInitialization = deferred<unknown>();
    const secondInitialization = deferred<unknown>();
    mocks.initializations.push(firstInitialization, secondInitialization);
    const controller = new TreeSitterRuntimeController("/project");

    const first = controller.start();
    await vi.waitFor(() => expect(mocks.runtimes).toHaveLength(1));
    const second = controller.start();
    await vi.waitFor(() => expect(mocks.runtimes).toHaveLength(2));
    secondInitialization.resolve({ parser: {}, language: {} });
    await expect(second).resolves.toEqual({ kind: "ready" });
    firstInitialization.resolve({ parser: {}, language: {} });

    await expect(first).resolves.toEqual({ kind: "unavailable", reason: "Startup superseded" });
    expect(mocks.runtimes[0]?.dispose).toHaveBeenCalledOnce();
    expect(mocks.runtimes[1]?.dispose).not.toHaveBeenCalled();
    expect(mocks.published).toHaveBeenCalledOnce();
    expect(controller.runtime).toBe(mocks.runtimes[1]);
  });
});
