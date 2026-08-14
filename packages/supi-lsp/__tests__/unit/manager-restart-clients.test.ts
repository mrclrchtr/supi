import { describe, expect, it, vi } from "vitest";
import { LspManager } from "../../src/manager/manager.ts";
import { fileToUri } from "../../src/utils.ts";

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
    const replacement = { start: vi.fn().mockRejectedValue(new Error("start failed")) };
    const clients = (manager as unknown as { clients: Map<string, unknown> }).clients;
    clients.set(`typescript:${sessionCwd}`, original);
    vi.spyOn(
      manager as unknown as { createClient: (...args: never[]) => unknown },
      "createClient",
    ).mockReturnValue(replacement);

    await expect(manager.restartClientsForFiles(["src/a.ts"])).resolves.toEqual([
      {
        key: `typescript:${sessionCwd}`,
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
        files: [`${sessionCwd}/src/a.ts`],
        restarted: true,
      },
    ]);
    expect(restartClient).toHaveBeenCalledWith(client);
  });
});
