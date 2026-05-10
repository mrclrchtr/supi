import { describe, expect, it, vi } from "vitest";
import { LspManager } from "../src/manager/manager.ts";

describe("LspManager restartClientsForFiles", () => {
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
        manager as unknown as { restartClient: (target: typeof client) => Promise<boolean> },
        "restartClient",
      )
      .mockResolvedValue(true);

    await expect(manager.restartClientsForFiles(["src/a.ts"])).resolves.toEqual([
      `typescript:${sessionCwd}`,
    ]);
    expect(restartClient).toHaveBeenCalledWith(client);
  });
});
