import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileToUri } from "@mrclrchtr/supi-core/path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileChangeType } from "../../src/config/types.ts";
import { LspManager, RECOVERY_CLIENT_STARTUP_BOUND_MS } from "../../src/manager/manager.ts";

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "restart-clients-"));
  tempDirs.push(root);
  return root;
}

function makeManager(cwd: string): LspManager {
  return new LspManager(
    {
      servers: {
        typescript: {
          command: "node",
          args: [],
          fileTypes: ["ts"],
          rootMarkers: ["package.json"],
        },
      },
    },
    cwd,
  );
}

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    name: "typescript",
    root: "",
    openFiles: [] as string[],
    status: "running" as const,
    hasDiagnosticProvider: false,
    shutdown: vi.fn().mockResolvedValue(undefined),
    notifyWorkspaceFileChanges: vi.fn(),
    getDiagnosticSnapshot: () => ({
      entries: [],
      current: true,
      documents: [] as Array<{ uri: string; current: boolean; status: string }>,
    }),
    ...overrides,
  };
}

function makeReplacement(overrides: Record<string, unknown> = {}) {
  return {
    name: "typescript",
    root: "",
    openFiles: [] as string[],
    hasDiagnosticProvider: false,
    start: vi.fn().mockResolvedValue(undefined),
    forceKill: vi.fn().mockResolvedValue(undefined),
    didOpen: vi.fn(),
    markFailedFile: vi.fn(),
    notifyWorkspaceFileChanges: vi.fn(),
    getDiagnosticSnapshot: () => ({
      entries: [],
      current: true,
      documents: [] as Array<{ uri: string; current: boolean; status: string }>,
    }),
    ...overrides,
  };
}

describe("LspManager restartClientsForFiles", () => {
  it("reports all owned files when a replacement fails to start", async () => {
    const sessionCwd = "/tmp/restart-failure-project";
    const manager = new LspManager(
      {
        servers: {
          typescript: {
            command: "node",
            args: [],
            fileTypes: ["ts"],
            rootMarkers: ["package.json"],
          },
        },
      },
      sessionCwd,
    );
    const original = {
      name: "typescript",
      root: sessionCwd,
      openFiles: [`${sessionCwd}/src/a.ts`],
      status: "running" as const,
      shutdown: vi.fn().mockResolvedValue(undefined),
      getDiagnosticSnapshot: () => ({
        entries: [],
        current: true,
        documents: [
          {
            uri: fileToUri(`${sessionCwd}/src/b.ts`),
            current: true,
            status: "confirmed" as const,
          },
        ],
      }),
    };
    const replacement = {
      start: vi.fn().mockRejectedValue(new Error("start failed")),
      forceKill: vi.fn().mockResolvedValue(undefined),
    };
    const clients = (manager as unknown as { clients: Map<string, unknown> }).clients;
    clients.set(`typescript:${sessionCwd}`, original);
    vi.spyOn(
      manager as unknown as { createClient: (...args: never[]) => unknown },
      "createClient",
    ).mockReturnValue(replacement);

    await expect(manager.restartClientsForFiles(["src/a.ts"])).resolves.toEqual([
      {
        key: `typescript:${sessionCwd}`,
        serverName: "typescript",
        files: [`${sessionCwd}/src/a.ts`, `${sessionCwd}/src/b.ts`],
        restarted: false,
      },
    ]);
  });

  it("restarts an existing client for cwd-relative diagnostic paths", async () => {
    const sessionCwd = "/tmp/session-project";
    const manager = new LspManager(
      {
        servers: {
          typescript: {
            command: "node",
            args: [],
            fileTypes: ["ts"],
            rootMarkers: ["package.json"],
          },
        },
      },
      sessionCwd,
    );

    manager.registerDetectedServers([
      {
        name: "typescript",
        root: sessionCwd,
        fileTypes: ["ts"],
      },
    ]);

    const client = { name: "typescript", root: sessionCwd };
    const clients = (
      manager as unknown as {
        clients: Map<string, typeof client>;
      }
    ).clients;
    clients.set(`typescript:${sessionCwd}`, client);

    const restartClient = vi
      .spyOn(
        manager as unknown as {
          restartClient: (
            target: typeof client,
          ) => Promise<{ files: string[]; restarted: boolean }>;
        },
        "restartClient",
      )
      .mockResolvedValue({ files: [`${sessionCwd}/src/a.ts`], restarted: true });

    await expect(manager.restartClientsForFiles(["src/a.ts"])).resolves.toEqual([
      {
        key: `typescript:${sessionCwd}`,
        serverName: "typescript",
        files: [`${sessionCwd}/src/a.ts`],
        restarted: true,
      },
    ]);
    expect(restartClient).toHaveBeenCalledWith(client);
  });

  it("skips pull-capable routes when only push-only restarts are requested", async () => {
    const sessionCwd = createProject();
    const manager = new LspManager(
      {
        servers: {
          typescript: {
            command: "node",
            args: [],
            fileTypes: ["ts"],
            rootMarkers: ["package.json"],
          },
          rust: {
            command: "rust-analyzer",
            args: [],
            fileTypes: ["rs"],
            rootMarkers: ["Cargo.toml"],
          },
        },
      },
      sessionCwd,
    );
    const tsFile = path.join(sessionCwd, "a.ts");
    const rsFile = path.join(sessionCwd, "b.rs");
    fs.writeFileSync(tsFile, "const a = 1;\n");
    fs.writeFileSync(rsFile, "fn main() {}\n");
    const pushClient = makeClient({ root: sessionCwd, openFiles: [tsFile] });
    const pullClient = makeClient({
      name: "rust",
      root: sessionCwd,
      openFiles: [rsFile],
      hasDiagnosticProvider: true,
    });
    const clients = (manager as unknown as { clients: Map<string, unknown> }).clients;
    clients.set(`typescript:${sessionCwd}`, pushClient);
    clients.set(`rust:${sessionCwd}`, pullClient);
    const createClient = vi
      .spyOn(manager as unknown as { createClient: (...args: never[]) => unknown }, "createClient")
      .mockReturnValue(makeReplacement());

    await manager.restartClientsForFiles([tsFile, rsFile], { pushOnly: true });

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(
      "typescript",
      expect.anything(),
      sessionCwd,
      `typescript:${sessionCwd}`,
    );
  });

  it("shares one in-flight restart between concurrent recovery calls", async () => {
    const sessionCwd = createProject();
    const manager = makeManager(sessionCwd);
    const file = path.join(sessionCwd, "a.ts");
    fs.writeFileSync(file, "const a = 1;\n");
    const client = makeClient({ root: sessionCwd, openFiles: [file] });
    const clients = (manager as unknown as { clients: Map<string, unknown> }).clients;
    clients.set(`typescript:${sessionCwd}`, client);

    let finishRestart!: (value: { files: string[]; restarted: boolean }) => void;
    const restartResult = new Promise<{ files: string[]; restarted: boolean }>((resolve) => {
      finishRestart = resolve;
    });
    const restartClient = vi
      .spyOn(
        manager as unknown as {
          restartClient: (
            target: typeof client,
          ) => Promise<{ files: string[]; restarted: boolean }>;
        },
        "restartClient",
      )
      .mockReturnValue(restartResult);

    const first = manager.restartClientsForFiles([file]);
    const second = manager.restartClientsForFiles([file]);

    expect(restartClient).toHaveBeenCalledTimes(1);
    finishRestart({ files: [file], restarted: true });
    const expected = [
      {
        key: `typescript:${sessionCwd}`,
        serverName: "typescript",
        files: [file],
        restarted: true,
      },
    ];
    await expect(first).resolves.toEqual(expected);
    await expect(second).resolves.toEqual(expected);
  });

  it("keeps a shared restart registered after one caller cancels", async () => {
    const sessionCwd = createProject();
    const manager = makeManager(sessionCwd);
    const file = path.join(sessionCwd, "a.ts");
    fs.writeFileSync(file, "const a = 1;\n");
    const client = makeClient({ root: sessionCwd, openFiles: [file] });
    const clients = (manager as unknown as { clients: Map<string, unknown> }).clients;
    clients.set(`typescript:${sessionCwd}`, client);

    let finishRestart!: (value: { files: string[]; restarted: boolean }) => void;
    const restartResult = new Promise<{ files: string[]; restarted: boolean }>((resolve) => {
      finishRestart = resolve;
    });
    const restartClient = vi
      .spyOn(
        manager as unknown as {
          restartClient: (
            target: typeof client,
          ) => Promise<{ files: string[]; restarted: boolean }>;
        },
        "restartClient",
      )
      .mockReturnValue(restartResult);
    const controller = new AbortController();

    const cancelled = manager.restartClientsForFiles([file], {
      control: { signal: controller.signal },
    });
    controller.abort(new Error("caller cancelled"));
    await expect(cancelled).rejects.toThrow("caller cancelled");

    const joined = manager.restartClientsForFiles([file]);
    expect(restartClient).toHaveBeenCalledTimes(1);
    finishRestart({ files: [file], restarted: true });
    await expect(joined).resolves.toEqual([
      {
        key: `typescript:${sessionCwd}`,
        serverName: "typescript",
        files: [file],
        restarted: true,
      },
    ]);
  });

  it("restarts each route at most once per invalidation generation", async () => {
    const sessionCwd = createProject();
    const manager = makeManager(sessionCwd);
    const fileA = path.join(sessionCwd, "a.ts");
    const fileB = path.join(sessionCwd, "b.ts");
    fs.writeFileSync(fileA, "const a = 1;\n");
    fs.writeFileSync(fileB, "const b = 1;\n");
    const original = makeClient({ root: sessionCwd, openFiles: [fileA] });
    const clients = (manager as unknown as { clients: Map<string, unknown> }).clients;
    clients.set(`typescript:${sessionCwd}`, original);
    const createClient = vi
      .spyOn(manager as unknown as { createClient: (...args: never[]) => unknown }, "createClient")
      .mockReturnValue(makeReplacement({ root: sessionCwd }));

    manager.noteWorkspaceChanges([{ uri: fileToUri(fileA), type: FileChangeType.Changed }]);
    await manager.restartClientsForFiles([fileA]);
    expect(createClient).toHaveBeenCalledTimes(1);

    // The same invalidation generation must not restart the route again.
    await manager.restartClientsForFiles([fileA]);
    expect(createClient).toHaveBeenCalledTimes(1);

    // A new workspace change opens a new invalidation generation.
    manager.noteWorkspaceChanges([{ uri: fileToUri(fileB), type: FileChangeType.Changed }]);
    await manager.restartClientsForFiles([fileA]);
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it("opens a new invalidation generation for a repeated edit to the same file", async () => {
    const sessionCwd = createProject();
    const manager = makeManager(sessionCwd);
    const fileA = path.join(sessionCwd, "a.ts");
    fs.writeFileSync(fileA, "const a = 1;\n");
    const original = makeClient({ root: sessionCwd, openFiles: [fileA] });
    const clients = (manager as unknown as { clients: Map<string, unknown> }).clients;
    clients.set(`typescript:${sessionCwd}`, original);
    const createClient = vi
      .spyOn(manager as unknown as { createClient: (...args: never[]) => unknown }, "createClient")
      .mockReturnValue(makeReplacement({ root: sessionCwd }));
    const change: { uri: string; type: FileChangeType } = {
      uri: fileToUri(fileA),
      type: FileChangeType.Changed,
    };

    manager.noteWorkspaceChanges([change]);
    await manager.restartClientsForFiles([fileA]);
    expect(createClient).toHaveBeenCalledTimes(1);

    // A second edit to the same file is a new invalidation event, even
    // though the change batch content is identical.
    manager.noteWorkspaceChanges([change]);
    await manager.restartClientsForFiles([fileA]);
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it("bounds replacement startup during a recovery restart", async () => {
    vi.useFakeTimers();
    try {
      const sessionCwd = "/tmp/bound-project";
      const manager = makeManager(sessionCwd);
      const original = makeClient({ root: sessionCwd, openFiles: [] });
      const clients = (manager as unknown as { clients: Map<string, unknown> }).clients;
      clients.set(`typescript:${sessionCwd}`, original);
      const replacement = makeReplacement({ start: vi.fn(() => new Promise(() => {})) });
      vi.spyOn(
        manager as unknown as { createClient: (...args: never[]) => unknown },
        "createClient",
      ).mockReturnValue(replacement);

      const pending = manager.restartClientsForFiles(["src/a.ts"]);
      await vi.advanceTimersByTimeAsync(RECOVERY_CLIENT_STARTUP_BOUND_MS);

      await expect(pending).resolves.toEqual([
        {
          key: `typescript:${sessionCwd}`,
          serverName: "typescript",
          files: [],
          restarted: false,
        },
      ]);
      expect(replacement.forceKill).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops between client restarts when the request is cancelled mid-loop", async () => {
    const sessionCwd = createProject();
    const rootA = path.join(sessionCwd, "a");
    const rootB = path.join(sessionCwd, "b");
    fs.mkdirSync(rootA);
    fs.mkdirSync(rootB);
    fs.writeFileSync(path.join(rootA, "package.json"), "{}");
    fs.writeFileSync(path.join(rootB, "package.json"), "{}");
    const fileA = path.join(rootA, "a.ts");
    const fileB = path.join(rootB, "b.ts");
    fs.writeFileSync(fileA, "const a = 1;\n");
    fs.writeFileSync(fileB, "const b = 1;\n");

    const manager = makeManager(sessionCwd);
    const clientA = makeClient({ root: rootA, openFiles: [fileA] });
    const clientB = makeClient({ root: rootB, openFiles: [fileB] });
    const clients = (manager as unknown as { clients: Map<string, unknown> }).clients;
    clients.set(`typescript:${rootA}`, clientA);
    clients.set(`typescript:${rootB}`, clientB);

    let releaseReplacementStart!: () => void;
    const deferredStart = new Promise<void>((resolve) => {
      releaseReplacementStart = resolve;
    });
    const createClient = vi
      .spyOn(manager as unknown as { createClient: (...args: never[]) => unknown }, "createClient")
      .mockReturnValueOnce(makeReplacement({ root: rootA, start: vi.fn(() => deferredStart) }))
      .mockReturnValueOnce(makeReplacement({ root: rootB }));

    const controller = new AbortController();
    const pending = manager.restartClientsForFiles([fileA, fileB], {
      control: { signal: controller.signal },
    });
    controller.abort(new Error("cancelled mid-loop"));
    releaseReplacementStart();

    await expect(pending).rejects.toThrow("cancelled mid-loop");
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(clientB.shutdown).not.toHaveBeenCalled();
  });
});
