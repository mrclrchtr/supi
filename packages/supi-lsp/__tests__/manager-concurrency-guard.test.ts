import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LspManager } from "../src/manager/manager.ts";

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "lsp-concurrency-"));
  // Create a package.json marker so findProjectRoot resolves to this directory
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "test" }));
  return root;
}

// Helper to access the private clients map
function getClients(manager: LspManager): Map<string, unknown> {
  return (manager as unknown as { clients: Map<string, unknown> }).clients;
}

// Helper to access the private unavailable set
function getUnavailable(manager: LspManager): Set<string> {
  return (manager as unknown as { unavailable: Set<string> }).unavailable;
}

// Helper to access the private pendingStarts map
function getPendingStarts(manager: LspManager): Map<string, Promise<unknown>> {
  return (manager as unknown as { pendingStarts: Map<string, Promise<unknown>> }).pendingStarts;
}

const MINIMAL_CONFIG = {
  servers: {
    typescript: {
      command: "ts-lsp",
      args: ["--stdio"],
      fileTypes: ["ts"],
      rootMarkers: ["package.json"],
    },
  },
};

describe("LspManager concurrency guard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deduplicates concurrent starts for the same server:root pair", async () => {
    const sessionCwd = makeTempRoot();
    const manager = new LspManager(
      {
        servers: {
          typescript: {
            command: "ts-lsp",
            args: ["--stdio"],
            fileTypes: ["ts"],
            rootMarkers: ["package.json"],
          },
        },
      },
      sessionCwd,
    );

    // Spy on the private performStart via the prototype *before* any
    // instance is created, so the spy is active when the test runs.
    // We'll clean up in afterEach/restoreAllMocks.
    const performStartSpy = vi
      .spyOn(
        LspManager.prototype as unknown as { performStart: () => Promise<null> },
        "performStart",
      )
      .mockImplementation(() => Promise.resolve(null));

    try {
      // Kick off two concurrent starts. The second should find the
      // pending promise from the first and return it without calling
      // performStart a second time.
      const [result1, result2] = await Promise.all([
        manager.startServerForRoot("typescript", sessionCwd),
        manager.startServerForRoot("typescript", sessionCwd),
      ]);

      // Both return the same value (null from the mock)
      expect(result1).toBe(result2);

      // Only one performStart invocation should have happened
      expect(performStartSpy).toHaveBeenCalledTimes(1);

      // pendingStarts should be cleaned up after resolution
      expect(getPendingStarts(manager).has(`typescript:${sessionCwd}`)).toBe(false);
    } finally {
      performStartSpy.mockRestore();
    }
  });

  it("returns existing running client without starting a new one", async () => {
    const sessionCwd = makeTempRoot();
    const manager = new LspManager(MINIMAL_CONFIG, sessionCwd);

    // Inject a fake running client
    const fakeClient = {
      name: "typescript",
      root: sessionCwd,
      status: "running",
    };
    getClients(manager).set(`typescript:${sessionCwd}`, fakeClient);

    const client = await manager.getClientForFile(`${sessionCwd}/src/index.ts`);

    // Should return the existing client
    expect(client).toBe(fakeClient);
  });

  it("does not start duplicate servers after a failed start is marked unavailable", async () => {
    const sessionCwd = makeTempRoot();
    const manager = new LspManager(
      {
        servers: {
          typescript: {
            command: "nonexistent-ts-lsp",
            args: [],
            fileTypes: ["ts"],
            rootMarkers: ["package.json"],
          },
        },
      },
      sessionCwd,
    );

    // First attempt should fail (binary doesn't exist) and mark as unavailable
    const first = await manager.startServerForRoot("typescript", sessionCwd);
    expect(first).toBeNull();
    expect(getUnavailable(manager).has(`typescript:${sessionCwd}`)).toBe(true);

    // Second attempt should return null immediately
    const second = await manager.startServerForRoot("typescript", sessionCwd);
    expect(second).toBeNull();

    // No clients should exist (the failed attempt is cleaned up)
    expect(getClients(manager).size).toBe(0);
  });

  it("returns null immediately for an already-unavailable server:root", async () => {
    const sessionCwd = makeTempRoot();
    const manager = new LspManager(MINIMAL_CONFIG, sessionCwd);

    // Pre-mark as unavailable
    getUnavailable(manager).add(`typescript:${sessionCwd}`);

    const result = await manager.startServerForRoot("typescript", sessionCwd);
    expect(result).toBeNull();
  });

  it("does not add to pendingStarts if client exists or is unavailable", async () => {
    const sessionCwd = makeTempRoot();
    const manager = new LspManager(MINIMAL_CONFIG, sessionCwd);

    // Call with unavailable server:root — should not touch pendingStarts
    getUnavailable(manager).add(`typescript:${sessionCwd}`);
    await manager.startServerForRoot("typescript", sessionCwd);
    expect(getPendingStarts(manager).has(`typescript:${sessionCwd}`)).toBe(false);

    // Now clear unavailable and inject a running client
    getUnavailable(manager).delete(`typescript:${sessionCwd}`);

    const fakeClient = {
      name: "typescript",
      root: sessionCwd,
      status: "running",
    };
    getClients(manager).set(`typescript:${sessionCwd}`, fakeClient);

    await manager.startServerForRoot("typescript", sessionCwd);
    expect(getPendingStarts(manager).has(`typescript:${sessionCwd}`)).toBe(false);
  });
});
