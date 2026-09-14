// Public code_health regression for concurrent first access to distinct files.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { LspRuntimeController, type WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceCodeIntelligenceSession } from "../../../../src/session/session.ts";
import { codeHealthSpec } from "../../../../src/tool/code_health/spec.ts";
import { registerCodeIntelligenceTools } from "../../../../src/tool/register.ts";
import { createPublicLspCapability } from "../../../helpers/public-lsp-capability.ts";
import { writeIsolatedFixtureConfig } from "../../../helpers/public-lsp-config.ts";

const fsPromisesMock = vi.hoisted(() => ({ readFile: vi.fn() }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: fsPromisesMock.readFile };
});

const FIXTURE = path.resolve(
  import.meta.dirname,
  "../../../../../supi-lsp/__tests__/fixtures/lsp-semantic-server.mjs",
);

type PendingRead = {
  filePath: string;
  resolve: (content: string) => void;
};

class ControlledReads {
  readonly calls: string[] = [];
  activeReads = 0;
  #autoResolve = false;
  #pending: PendingRead[] = [];
  #waiters: Array<{ count: number; resolve: () => void }> = [];

  read(filePath: string): Promise<string> {
    this.calls.push(filePath);
    this.activeReads++;
    const result = new Promise<string>((resolve) => {
      this.#pending.push({ filePath, resolve });
      this.#notifyCallWaiters();
    });
    if (this.#autoResolve) queueMicrotask(() => this.resolveAll());
    return result;
  }

  enableAutoResolve(): void {
    this.#autoResolve = true;
    this.resolveAll();
  }

  waitForCalls(count: number): Promise<void> {
    if (this.calls.length >= count) return Promise.resolve();
    return new Promise((resolve) => {
      this.#waiters.push({ count, resolve });
    });
  }

  resolveAll(): void {
    const pending = this.#pending.splice(0);
    for (const read of pending) {
      this.activeReads--;
      read.resolve(fs.readFileSync(read.filePath, "utf-8"));
    }
  }

  #notifyCallWaiters(): void {
    const ready = this.#waiters.filter((waiter) => this.calls.length >= waiter.count);
    this.#waiters = this.#waiters.filter((waiter) => this.calls.length < waiter.count);
    for (const waiter of ready) waiter.resolve();
  }
}

interface TestWorkspace {
  readonly cwd: string;
  readonly firstFile: string;
  readonly secondFile: string;
  readonly controller: LspRuntimeController;
  readonly runtime: WorkspaceLspRuntime;
}

interface EnrollmentWait {
  readonly promise: Promise<number | null>;
  cancel(): void;
}

async function createWorkspace(): Promise<TestWorkspace> {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "code-intelligence-first-access-"));
  const seed = path.join(cwd, "warm-seed.test");
  const firstFile = path.join(cwd, "cold-a.test");
  const secondFile = path.join(cwd, "cold-b.test");
  const logPath = path.join(cwd, "server.log");
  fs.writeFileSync(path.join(cwd, "project.marker"), "");
  fs.writeFileSync(seed, "seed-v1");
  fs.writeFileSync(firstFile, "first-v1");
  fs.writeFileSync(secondFile, "second-v1");
  fs.writeFileSync(logPath, "");
  writeIsolatedFixtureConfig(cwd, {
    args: [FIXTURE, logPath, "10", "pull"],
    fileTypes: ["test"],
  });

  const controller = new LspRuntimeController(cwd);
  try {
    const started = await controller.start();
    if (started.kind !== "ready") {
      throw new Error(`Fixture LSP did not start: ${started.kind}`);
    }
    await expect(started.runtime.trackFile(seed)).resolves.toBe(true);
    await expect(started.runtime.waitUntilReadyForFile(seed)).resolves.toMatchObject({
      kind: "ready",
    });
    return { cwd, firstFile, secondFile, controller, runtime: started.runtime };
  } catch (error) {
    await controller.shutdown();
    fs.rmSync(cwd, { recursive: true, force: true });
    throw error;
  }
}

describe("registered public code_health concurrent first access", () => {
  let reads: ControlledReads | undefined;
  let workspace: TestWorkspace | undefined;
  let pendingCalls: Promise<unknown>[] = [];
  let enrollmentWaits: EnrollmentWait[] = [];

  beforeEach(() => {
    reads = new ControlledReads();
    fsPromisesMock.readFile.mockImplementation((filePath: string) =>
      Promise.resolve(fs.readFileSync(filePath, "utf-8")),
    );
  });

  afterEach(async () => {
    for (const enrollment of enrollmentWaits) enrollment.cancel();
    await Promise.allSettled(enrollmentWaits.map((enrollment) => enrollment.promise));
    reads?.enableAutoResolve();
    await Promise.allSettled(pendingCalls);
    await workspace?.controller.shutdown();
    if (workspace) fs.rmSync(workspace.cwd, { recursive: true, force: true });
    fsPromisesMock.readFile.mockReset();
    pendingCalls = [];
    enrollmentWaits = [];
    workspace = undefined;
    reads = undefined;
  });

  it.each([
    { name: "explicit refresh", refresh: true },
    { name: "passive exact-file request", refresh: false },
  ])(
    "confirms both files through concurrently executed registered code_health calls ($name)",
    async ({ refresh }) => {
      workspace = await createWorkspace();
      const { cwd, firstFile, secondFile, runtime } = workspace;
      const controlledReads = reads;
      if (!controlledReads) throw new Error("Controlled reads were not initialized.");

      const pi = createPiMock();
      const session = new WorkspaceCodeIntelligenceSession(cwd, createPublicLspCapability(runtime));
      registerCodeIntelligenceTools(pi as never, () => session, undefined, [codeHealthSpec]);
      const health = getTool(pi, "code_health");

      fsPromisesMock.readFile.mockImplementation((filePath: string) =>
        controlledReads.read(filePath),
      );

      const first = health.execute(
        "health-first-access-a",
        { scope: firstFile, include: ["diagnostics"], refresh, level: "detailed" },
        undefined,
        undefined,
        makeCtx({ cwd }),
      );
      pendingCalls.push(first);
      await controlledReads.waitForCalls(2);

      const enrollment = waitForPublicEnrollment(runtime, secondFile);
      enrollmentWaits.push(enrollment);
      const second = health.execute(
        "health-first-access-b",
        { scope: secondFile, include: ["diagnostics"], refresh, level: "detailed" },
        undefined,
        undefined,
        makeCtx({ cwd }),
      );
      pendingCalls.push(second);
      await expect(enrollment.promise).resolves.not.toBeNull();
      expect(controlledReads.activeReads).toBe(2);

      controlledReads.enableAutoResolve();
      const outcomes = await Promise.allSettled([first, second]);
      for (const outcome of outcomes) {
        expect(outcome.status).toBe("fulfilled");
        if (outcome.status !== "fulfilled") continue;
        const details = (outcome.value as { details: { data: Record<string, unknown> } }).details;
        expect(details.data.diagnosticObservation).toMatchObject({
          kind: "completed",
          evidence: {
            requested: 1,
            confirmed: 1,
            unconfirmed: 0,
            failed: 0,
            removed: 0,
          },
        });
      }
    },
  );
});

function waitForPublicEnrollment(runtime: WorkspaceLspRuntime, filePath: string): EnrollmentWait {
  let cancelled = false;
  let resolvePromise: (version: number | null) => void = () => {};
  const promise = new Promise<number | null>((resolve) => {
    resolvePromise = resolve;
  });

  const poll = (): void => {
    if (cancelled) return;
    const version = runtime.getOpenDocumentVersion(filePath);
    if (version !== null) {
      resolvePromise(version);
      return;
    }
    setImmediate(poll);
  };
  poll();

  return {
    promise,
    cancel(): void {
      if (cancelled) return;
      cancelled = true;
      resolvePromise(null);
    },
  };
}
