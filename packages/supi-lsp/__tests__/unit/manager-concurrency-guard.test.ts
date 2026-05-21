import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LspManager } from "../../src/manager/manager.ts";

type UnavailableReason = "missing-command" | "start-failed" | "runtime-error";

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

// Helper to access the private unavailable-reason map
function getUnavailable(manager: LspManager): Map<string, UnavailableReason> {
  return (manager as unknown as { unavailable: Map<string, UnavailableReason> }).unavailable;
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

    const performStartSpy = vi
      .spyOn(
        LspManager.prototype as unknown as { performStart: () => Promise<null> },
        "performStart",
      )
      .mockImplementation(() => Promise.resolve(null));

    try {
      const [result1, result2] = await Promise.all([
        manager.startServerForRoot("typescript", sessionCwd),
        manager.startServerForRoot("typescript", sessionCwd),
      ]);

      expect(result1).toBe(result2);
      expect(performStartSpy).toHaveBeenCalledTimes(1);
      expect(getPendingStarts(manager).has(`typescript:${sessionCwd}`)).toBe(false);
    } finally {
      performStartSpy.mockRestore();
      rmSync(sessionCwd, { recursive: true, force: true });
    }
  });

  it("returns existing running client without starting a new one", async () => {
    const sessionCwd = makeTempRoot();
    const manager = new LspManager(MINIMAL_CONFIG, sessionCwd);

    try {
      const fakeClient = {
        name: "typescript",
        root: sessionCwd,
        status: "running",
      };
      getClients(manager).set(`typescript:${sessionCwd}`, fakeClient);

      const client = await manager.getClientForFile(`${sessionCwd}/src/index.ts`);

      expect(client).toBe(fakeClient);
    } finally {
      rmSync(sessionCwd, { recursive: true, force: true });
    }
  });

  it("retries a missing-command root once the command becomes available", async () => {
    const sessionCwd = makeTempRoot();
    const config = {
      servers: {
        typescript: {
          command: "nonexistent-ts-lsp",
          args: [] as string[],
          fileTypes: ["ts"],
          rootMarkers: ["package.json"],
        },
      },
    };
    const manager = new LspManager(config, sessionCwd);
    const key = `typescript:${sessionCwd}`;

    try {
      const first = await manager.startServerForRoot("typescript", sessionCwd);
      expect(first).toBeNull();
      expect(getUnavailable(manager).get(key)).toBe("missing-command");

      config.servers.typescript.command = "node";
      const performStartSpy = vi
        .spyOn(
          LspManager.prototype as unknown as { performStart: () => Promise<null> },
          "performStart",
        )
        .mockImplementation(() => Promise.resolve(null));

      try {
        const second = await manager.startServerForRoot("typescript", sessionCwd);
        expect(second).toBeNull();
        expect(performStartSpy).toHaveBeenCalledTimes(1);
        expect(getUnavailable(manager).has(key)).toBe(false);
      } finally {
        performStartSpy.mockRestore();
      }
    } finally {
      rmSync(sessionCwd, { recursive: true, force: true });
    }
  });

  it.each([
    "start-failed",
    "runtime-error",
  ] as const)("returns null immediately for an already-%s server:root", async (reason) => {
    const sessionCwd = makeTempRoot();
    const manager = new LspManager(MINIMAL_CONFIG, sessionCwd);
    const key = `typescript:${sessionCwd}`;

    getUnavailable(manager).set(key, reason);

    const result = await manager.startServerForRoot("typescript", sessionCwd);
    expect(result).toBeNull();
    expect(getPendingStarts(manager).has(key)).toBe(false);

    rmSync(sessionCwd, { recursive: true, force: true });
  });

  it("does not add to pendingStarts if client exists or the root is sticky-unavailable", async () => {
    const sessionCwd = makeTempRoot();
    const manager = new LspManager(MINIMAL_CONFIG, sessionCwd);
    const key = `typescript:${sessionCwd}`;

    getUnavailable(manager).set(key, "start-failed");
    await manager.startServerForRoot("typescript", sessionCwd);
    expect(getPendingStarts(manager).has(key)).toBe(false);

    getUnavailable(manager).delete(key);

    const fakeClient = {
      name: "typescript",
      root: sessionCwd,
      status: "running",
    };
    getClients(manager).set(key, fakeClient);

    await manager.startServerForRoot("typescript", sessionCwd);
    expect(getPendingStarts(manager).has(key)).toBe(false);

    rmSync(sessionCwd, { recursive: true, force: true });
  });
});
