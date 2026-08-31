import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { completedCodeQuery, unavailableCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LspManager } from "../../src/manager/manager.ts";
import { findWorkspaceSymbolWarmTargets } from "../../src/manager/manager-workspace-symbol.ts";
import { createAutomaticLspPathPolicy } from "../../src/workspace-path-policy.ts";

const tempDirs: string[] = [];

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "lsp-workspace-symbol-"));
  tempDirs.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "test" }));
  const sourceFile = join(root, "src", "index.ts");
  mkdirSync(dirname(sourceFile), { recursive: true });
  writeFileSync(sourceFile, "export const Widget = 1;\n");
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

  it("does not select a built-in or configured excluded warm file", () => {
    const root = makeTempRoot();
    rmSync(join(root, "src"), { recursive: true, force: true });
    for (const relativePath of [
      ".cache/cached.ts",
      ".pi/npm/private.ts",
      "configured/drop.ts",
      ".storybook/eligible.ts",
    ]) {
      const file = join(root, relativePath);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, "export {};\n");
    }
    const policy = createAutomaticLspPathPolicy(root, ["configured/"]);

    expect(findWorkspaceSymbolWarmTargets(root, ["package.json"], ["ts"], { policy })).toEqual([
      { projectRoot: root, file: join(root, ".storybook", "eligible.ts") },
    ]);
  });

  it("selects a repository-negated warm file", () => {
    const root = makeTempRoot();
    rmSync(join(root, "src"), { recursive: true, force: true });
    mkdirSync(join(root, "generated"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), "generated/*\n!generated/keep.ts\n");
    writeFileSync(join(root, "generated", "drop.ts"), "export {};\n");
    writeFileSync(join(root, "generated", "keep.ts"), "export {};\n");
    const policy = createAutomaticLspPathPolicy(root, []);

    expect(findWorkspaceSymbolWarmTargets(root, ["package.json"], ["ts"], { policy })).toEqual([
      { projectRoot: root, file: join(root, "generated", "keep.ts") },
    ]);
  });
});

describe("LspManager semantic readiness warm-up", () => {
  it("keeps a replacement probe registered when an old probe settles", async () => {
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
    let resolveFirst!: (result: ReturnType<typeof completedCodeQuery<never[]>>) => void;
    let resolveSecond!: (result: ReturnType<typeof completedCodeQuery<never[]>>) => void;
    const firstResult = new Promise<ReturnType<typeof completedCodeQuery<never[]>>>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResult = new Promise<ReturnType<typeof completedCodeQuery<never[]>>>((resolve) => {
      resolveSecond = resolve;
    });
    const firstClient = {
      name: "typescript",
      root,
      documentSymbols: vi.fn(() => firstResult),
      hover: vi.fn(),
    };
    const secondClient = {
      name: "typescript",
      root,
      documentSymbols: vi.fn(() => secondResult),
      hover: vi.fn(),
    };
    const key = `typescript:${root}`;
    const clients = getClients(manager);
    clients.set(key, firstClient);
    vi.spyOn(manager, "ensureFileOpen").mockImplementation(async () => clients.get(key) as never);
    const warmSemanticProject = (
      manager as unknown as {
        warmSemanticProject(client: unknown, file: string): Promise<void>;
      }
    ).warmSemanticProject.bind(manager);
    const pending = (manager as unknown as { pendingWarmProbes: Map<string, Promise<void>> })
      .pendingWarmProbes;
    const file = join(root, "src", "index.ts");

    const first = warmSemanticProject(firstClient, file);
    await vi.waitFor(() => expect(firstClient.documentSymbols).toHaveBeenCalled());
    pending.delete(key);
    clients.set(key, secondClient);
    const second = warmSemanticProject(secondClient, file);
    await vi.waitFor(() => expect(secondClient.documentSymbols).toHaveBeenCalled());

    resolveFirst(completedCodeQuery([]));
    await first;
    expect(pending.has(key)).toBe(true);

    resolveSecond(completedCodeQuery([]));
    await second;
    expect(pending.has(key)).toBe(false);
  });

  it("retries a semantic probe that returned unavailable", async () => {
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
    const client = {
      name: "typescript",
      root,
      status: "running",
      ready: true,
      getReady: vi.fn().mockResolvedValue(undefined),
      documentSymbols: vi
        .fn()
        .mockResolvedValueOnce(unavailableCodeQuery("not ready"))
        .mockResolvedValueOnce(completedCodeQuery([])),
      hover: vi.fn(),
    };
    getClients(manager).set(`typescript:${root}`, client);
    vi.spyOn(manager, "ensureFileOpen").mockResolvedValue(client as never);

    await manager.waitUntilWorkspaceReady();
    await manager.waitUntilWorkspaceReady();

    expect(client.documentSymbols).toHaveBeenCalledTimes(2);
  });
});

describe("LspManager.workspaceSymbol cold warm-up", () => {
  it("retries a workspace-symbol probe that returned unavailable", async () => {
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
    const client = {
      name: "typescript",
      root,
      status: "running",
      openFiles: [] as string[],
      serverCapabilities: { workspaceSymbolProvider: true },
      workspaceSymbol: vi.fn().mockResolvedValue(completedCodeQuery([])),
      documentSymbols: vi
        .fn()
        .mockResolvedValueOnce(unavailableCodeQuery("not ready"))
        .mockResolvedValueOnce(completedCodeQuery([])),
      hover: vi.fn(),
    };
    getClients(manager).set(`typescript:${root}`, client);
    vi.spyOn(manager, "ensureFileOpen").mockResolvedValue(client as never);

    await manager.workspaceSymbol("Widget");
    await manager.workspaceSymbol("Widget");

    expect(client.documentSymbols).toHaveBeenCalledTimes(2);
  });

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
      name: "Widget",
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
        .mockResolvedValueOnce(completedCodeQuery([]))
        .mockResolvedValueOnce(completedCodeQuery([symbol]))
        .mockResolvedValue(completedCodeQuery([symbol])),
      documentSymbols: vi.fn().mockResolvedValue(
        completedCodeQuery([
          {
            name: "Widget",
            kind: 12,
            selectionRange: {
              start: { line: 0, character: 13 },
              end: { line: 0, character: 31 },
            },
          },
        ]),
      ),
      hover: vi.fn().mockResolvedValue(completedCodeQuery({ contents: "hovered" })),
    };

    getClients(manager).set(`typescript:${root}`, client);

    const ensureFileOpen = vi
      .spyOn(manager, "ensureFileOpen")
      .mockImplementation(async (filePath: string) => {
        client.openFiles = [filePath];
        return client as never;
      });

    const result = await manager.workspaceSymbol("Widget");

    expect(result).toEqual({ kind: "completed", data: [symbol] });
    expect(ensureFileOpen).toHaveBeenCalledWith(join(root, "src", "index.ts"));
    expect(client.documentSymbols).toHaveBeenCalledWith(join(root, "src", "index.ts"));
    expect(client.hover).toHaveBeenCalledWith(join(root, "src", "index.ts"), {
      line: 0,
      character: 13,
    });
    expect(client.workspaceSymbol).toHaveBeenCalledTimes(2);

    await manager.workspaceSymbol("Widget");
    expect(ensureFileOpen).toHaveBeenCalledTimes(1);
  });
});
