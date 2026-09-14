// Public runtime regression for concurrent first access to distinct files.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { LspRuntimeController, type WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ControlledReads } from "../helpers/controlled-reads.ts";
import { disabledDefaultServers } from "../helpers/disabled-default-servers.ts";

const fsPromisesMock = vi.hoisted(() => ({ readFile: vi.fn() }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: fsPromisesMock.readFile };
});

const FIXTURE = path.resolve(import.meta.dirname, "../fixtures/lsp-semantic-server.mjs");
interface TestWorkspace {
  readonly cwd: string;
  readonly seed: string;
  readonly firstFile: string;
  readonly secondFile: string;
  readonly thirdFile: string;
  readonly controller: LspRuntimeController;
  readonly runtime: WorkspaceLspRuntime;
}

interface EnrollmentWait {
  readonly promise: Promise<number | null>;
  cancel(): void;
}

function writeProjectConfig(cwd: string, logPath: string): void {
  fs.mkdirSync(path.join(cwd, ".pi", "supi"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".pi", "supi", "config.json"),
    JSON.stringify({
      lsp: {
        servers: {
          fixture: {
            command: process.execPath,
            args: [FIXTURE, logPath, "10", "pull"],
            fileTypes: ["ts"],
            rootMarkers: ["project.marker"],
          },
          ...disabledDefaultServers(cwd),
        },
      },
    }),
  );
}

async function createWorkspace(): Promise<TestWorkspace> {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-runtime-first-access-"));
  const seed = path.join(cwd, "warm-seed.ts");
  const firstFile = path.join(cwd, "cold-a.ts");
  const secondFile = path.join(cwd, "cold-b.ts");
  const thirdFile = path.join(cwd, "cold-c.ts");
  const logPath = path.join(cwd, "server.log");
  fs.writeFileSync(path.join(cwd, "project.marker"), "");
  fs.writeFileSync(path.join(cwd, "tsconfig.json"), '{"include":["*.ts"]}\n');
  fs.writeFileSync(seed, "export const warmSeed = 1;\n");
  fs.writeFileSync(thirdFile, "export const third = 3;\n");
  fs.writeFileSync(logPath, "");
  writeProjectConfig(cwd, logPath);

  const controller = new LspRuntimeController(cwd);
  try {
    const started = await controller.start();
    if (started.kind !== "ready") {
      throw new Error(`Fixture LSP did not start: ${started.kind}`);
    }
    return { cwd, seed, firstFile, secondFile, thirdFile, controller, runtime: started.runtime };
  } catch (error) {
    await controller.shutdown();
    fs.rmSync(cwd, { recursive: true, force: true });
    throw error;
  }
}

describe("public WorkspaceLspRuntime concurrent first access", () => {
  let reads: ControlledReads | undefined;
  let workspace: TestWorkspace | undefined;
  let pendingRequests: Promise<unknown>[] = [];
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
    await Promise.allSettled(pendingRequests);
    await workspace?.controller.shutdown();
    if (workspace) fs.rmSync(workspace.cwd, { recursive: true, force: true });
    fsPromisesMock.readFile.mockReset();
    pendingRequests = [];
    enrollmentWaits = [];
    workspace = undefined;
    reads = undefined;
  });

  it("confirms both distinct files on their first concurrent diagnostic access", async () => {
    workspace = await createWorkspace();
    const { firstFile, secondFile, seed, runtime } = workspace;
    const controlledReads = reads;
    if (!controlledReads) throw new Error("Controlled reads were not initialized.");

    await expect(runtime.trackFile(seed)).resolves.toBe(true);
    await expect(runtime.waitUntilReadyForFile(seed)).resolves.toMatchObject({ kind: "ready" });

    fs.writeFileSync(firstFile, "export const first = 1;\n");
    fs.writeFileSync(secondFile, "export const second = 2;\n");
    fsPromisesMock.readFile.mockImplementation((filePath: string) =>
      controlledReads.read(filePath),
    );

    const first = runtime.fileDiagnostics(firstFile);
    pendingRequests.push(first);
    await controlledReads.waitForCalls(2);
    expect(controlledReads.activeReads).toBe(2);

    const enrollment = waitForPublicEnrollment(runtime, secondFile);
    enrollmentWaits.push(enrollment);
    const second = runtime.fileDiagnostics(secondFile);
    pendingRequests.push(second);
    await expect(enrollment.promise).resolves.not.toBeNull();

    // The second didOpen must happen while the first full-content pass is held.
    expect(controlledReads.activeReads).toBe(2);
    controlledReads.enableAutoResolve();

    const outcomes = await Promise.allSettled([first, second]);
    for (const outcome of outcomes) {
      expect(outcome.status).toBe("fulfilled");
      if (outcome.status === "fulfilled") {
        expect(outcome.value).toEqual({ kind: "completed", data: [] });
      }
    }

    expect(runtime.getOpenDocumentVersion(firstFile)).not.toBeNull();
    expect(runtime.getOpenDocumentVersion(secondFile)).not.toBeNull();
  });

  it("does not retry beyond one continued enrollment", async () => {
    workspace = await createWorkspace();
    const { firstFile, secondFile, thirdFile, seed, runtime } = workspace;
    const controlledReads = reads;
    if (!controlledReads) throw new Error("Controlled reads were not initialized.");

    await expect(runtime.trackFile(seed)).resolves.toBe(true);
    await expect(runtime.waitUntilReadyForFile(seed)).resolves.toMatchObject({ kind: "ready" });

    fs.writeFileSync(firstFile, "export const first = 1;\n");
    fs.writeFileSync(secondFile, "export const second = 2;\n");
    fsPromisesMock.readFile.mockImplementation((filePath: string) =>
      controlledReads.read(filePath),
    );

    const first = runtime.fileDiagnostics(firstFile);
    pendingRequests.push(first);
    await controlledReads.waitForCalls(2);

    const second = runtime.fileDiagnostics(secondFile);
    pendingRequests.push(second);
    const enrollment = waitForPublicEnrollment(runtime, secondFile);
    enrollmentWaits.push(enrollment);
    await expect(enrollment.promise).resolves.not.toBeNull();
    controlledReads.resolveAll();
    await controlledReads.waitForCalls(5);

    await expect(runtime.trackFile(thirdFile)).resolves.toBe(true);
    expect(runtime.getOpenDocumentVersion(thirdFile)).not.toBeNull();
    controlledReads.enableAutoResolve();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.kind).toBe("unavailable");
    if (firstResult.kind === "unavailable") {
      expect(firstResult.reason).toContain("Semantic input synchronization failed");
    }
    expect(secondResult).toEqual({ kind: "completed", data: [] });
  });

  it("does not retry when the enrolled document closes before the pass settles", async () => {
    workspace = await createWorkspace();
    const { firstFile, secondFile, seed, runtime } = workspace;
    const controlledReads = reads;
    if (!controlledReads) throw new Error("Controlled reads were not initialized.");

    await expect(runtime.trackFile(seed)).resolves.toBe(true);
    await expect(runtime.waitUntilReadyForFile(seed)).resolves.toMatchObject({ kind: "ready" });

    fs.writeFileSync(firstFile, "export const first = 1;\n");
    fs.writeFileSync(secondFile, "export const second = 2;\n");
    fsPromisesMock.readFile.mockImplementation((filePath: string) =>
      controlledReads.read(filePath),
    );

    const first = runtime.fileDiagnostics(firstFile);
    pendingRequests.push(first);
    await controlledReads.waitForCalls(2);
    await expect(runtime.trackFile(secondFile)).resolves.toBe(true);
    runtime.closeFile(secondFile);
    controlledReads.resolveAll();

    await expect(first).resolves.toMatchObject({ kind: "unavailable" });
    expect(controlledReads.calls).toHaveLength(2);
  });
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
