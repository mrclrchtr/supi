import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LspManager } from "../../src/manager/manager.ts";
import { findWorkspaceSymbolWarmTargets } from "../../src/manager/manager-workspace-symbol.ts";

const tempDirs: string[] = [];

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "lsp-workspace-symbol-"));
  tempDirs.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "test" }));
  const sourceFile = join(root, "src", "index.ts");
  mkdirSync(dirname(sourceFile), { recursive: true });
  writeFileSync(sourceFile, "export const SessionLspService = 1;\n");
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function getClients(manager: LspManager): Map<string, unknown> {
  return (manager as unknown as { clients: Map<string, unknown> }).clients;
}

// biome-ignore lint/security/noSecrets: test name only; no secret material.
describe("findWorkspaceSymbolWarmTargets", () => {
  it("prefers nested marker roots before broader package markers", () => {
    const root = makeTempRoot();
    const packageRoot = join(root, "packages", "feature");
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "feature" }));
    writeFileSync(
      join(packageRoot, "tsconfig.json"),
      JSON.stringify({ extends: "../../tsconfig.json" }),
    );
    mkdirSync(join(packageRoot, "src"), { recursive: true });
    writeFileSync(join(packageRoot, "src", "feature.ts"), "export const feature = 1;\n");

    const targets = findWorkspaceSymbolWarmTargets(root, ["tsconfig.json", "package.json"], ["ts"]);

    expect(targets[0]).toEqual({
      projectRoot: packageRoot,
      file: join(packageRoot, "src", "feature.ts"),
    });
  });
});

describe("LspManager.workspaceSymbol cold warm-up", () => {
  it("warms a cold workspace-symbol client and returns warmed results", async () => {
    const root = makeTempRoot();
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
      root,
    );

    const symbol = {
      name: "SessionLspService",
      kind: 12,
      location: {
        uri: `file://${join(root, "src", "index.ts")}`,
        range: { start: { line: 0, character: 13 }, end: { line: 0, character: 31 } },
      },
    };

    const client = {
      name: "typescript",
      root,
      status: "running",
      openFiles: [] as string[],
      serverCapabilities: { workspaceSymbolProvider: true },
      workspaceSymbol: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([symbol])
        .mockResolvedValue([symbol]),
      documentSymbols: vi.fn().mockResolvedValue([
        {
          name: "SessionLspService",
          kind: 12,
          selectionRange: {
            start: { line: 0, character: 13 },
            end: { line: 0, character: 31 },
          },
        },
      ]),
      hover: vi.fn().mockResolvedValue({ contents: "hovered" }),
    };

    getClients(manager).set(`typescript:${root}`, client);

    const ensureFileOpen = vi
      .spyOn(manager, "ensureFileOpen")
      .mockImplementation(async (filePath: string) => {
        client.openFiles = [filePath];
        return client as never;
      });

    const result = await manager.workspaceSymbol("SessionLspService");

    expect(result).toEqual([symbol]);
    expect(ensureFileOpen).toHaveBeenCalledWith(join(root, "src", "index.ts"));
    expect(client.documentSymbols).toHaveBeenCalledWith(join(root, "src", "index.ts"));
    expect(client.hover).toHaveBeenCalledWith(join(root, "src", "index.ts"), {
      line: 0,
      character: 13,
    });
    expect(client.workspaceSymbol).toHaveBeenCalledTimes(2);

    await manager.workspaceSymbol("SessionLspService");
    expect(ensureFileOpen).toHaveBeenCalledTimes(1);
  });
});
