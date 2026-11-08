import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { completedCodeQuery, unavailableCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { fileToUri } from "@mrclrchtr/supi-core/path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LspManager } from "../../src/manager/manager.ts";
import {
  findWorkspaceSymbolWarmTargets,
  workspaceSymbolCollectionResult,
  workspaceSymbolCoverageGap,
} from "../../src/manager/manager-workspace-symbol.ts";
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

  it("tries source directories before root config files and dotfiles", () => {
    const root = makeTempRoot();
    writeFileSync(join(root, ".tool.cjs"), "module.exports = {};\n");
    writeFileSync(join(root, "knip.config.ts"), "export default {};\n");

    expect(
      findWorkspaceSymbolWarmTargets(root, ["package.json"], ["ts", "cjs"]).map((t) => t.file),
    ).toEqual([
      join(root, "src", "index.ts"),
      join(root, "knip.config.ts"),
      join(root, ".tool.cjs"),
    ]);
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

// biome-ignore lint/security/noSecrets: test name only; no secret material.
describe("workspaceSymbolCollectionResult", () => {
  const exclusion = {
    results: [],
    hasSupport: true,
    completedClientCount: 1,
    failures: [] as string[],
    excludedCount: 1,
    excludedExamples: ["dist/widget.d.ts"],
  };

  it("marks policy exclusions as the only gap", () => {
    expect(workspaceSymbolCollectionResult(exclusion)).toMatchObject({
      kind: "partial",
      metadata: { exclusionOnly: true },
    });
  });

  it.each([
    ["a route failure", { ...exclusion, failures: ["route failed"] }],
    ["a coverage gap", workspaceSymbolCoverageGap(exclusion, 1)],
  ])("does not mark exclusions as the only gap with %s", (_label, collection) => {
    const result = workspaceSymbolCollectionResult(collection);
    expect(result.kind).toBe("partial");
    expect(result.kind === "partial" && result.metadata?.exclusionOnly).toBeFalsy();
  });
});

describe("LspManager.workspaceSymbol filtering", () => {
  it("filters automatic results and discloses configured exclusions", async () => {
    const root = makeTempRoot();
    const excluded = join(root, "configured", "drop.ts");
    mkdirSync(dirname(excluded), { recursive: true });
    writeFileSync(excluded, "export const Drop = 1;\n");
    const visible = join(root, "src", "index.ts");
    const symbols = [
      {
        name: "Drop",
        kind: 12,
        location: { uri: fileToUri(excluded), range: { start: {}, end: {} } },
      },
      {
        name: "AnotherDrop",
        kind: 12,
        location: { uri: fileToUri(excluded), range: { start: {}, end: {} } },
      },
      {
        name: "Widget",
        kind: 12,
        location: { uri: fileToUri(visible), range: { start: {}, end: {} } },
      },
    ];
    const policy = createAutomaticLspPathPolicy(root, ["configured/"]);
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
      undefined,
      policy,
    );
    const client = {
      name: "typescript",
      root,
      status: "running",
      serverCapabilities: { workspaceSymbolProvider: true },
      workspaceSymbol: vi.fn().mockResolvedValue(completedCodeQuery(symbols)),
    };
    getClients(manager).set(`typescript:${root}`, client);

    const filtered = await manager.workspaceSymbol("Widget");

    expect(filtered).toMatchObject({
      kind: "partial",
      data: [symbols[2]],
      reason: "Automatic path policy excluded 2 workspace-symbol results.",
      metadata: {
        automaticPathExclusion: {
          excludedCount: 2,
          examples: ["configured/drop.ts"],
        },
        exclusionOnly: true,
      },
    });

    const explicit = await manager.workspaceSymbol("Drop", undefined, [excluded]);
    expect(explicit).toEqual({ kind: "completed", data: symbols });
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
      projectMembership: vi.fn().mockResolvedValue("unknown"),
    };
    getClients(manager).set(`typescript:${root}`, client);
    vi.spyOn(manager, "ensureFileOpen").mockResolvedValue(client as never);

    await manager.workspaceSymbol("Widget");
    await manager.workspaceSymbol("Widget");

    expect(client.documentSymbols).toHaveBeenCalledTimes(2);
  });

  it("skips inferred-project probes and reports partial when none reach a project", async () => {
    const root = makeTempRoot();
    writeFileSync(join(root, "knip.config.ts"), "export default {};\n");
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
      serverCapabilities: { workspaceSymbolProvider: true },
      workspaceSymbol: vi.fn().mockResolvedValue(completedCodeQuery([])),
      documentSymbols: vi.fn().mockResolvedValue(completedCodeQuery([])),
      hover: vi.fn(),
      projectMembership: vi.fn().mockResolvedValue("inferred"),
    };
    getClients(manager).set(`typescript:${root}`, client);
    vi.spyOn(manager, "ensureFileOpen").mockResolvedValue(client as never);

    const first = await manager.workspaceSymbol("Widget");
    expect(first).toMatchObject({
      kind: "partial",
      data: [],
      reason: expect.stringContaining("2 opened warm-up files loaded only inferred projects"),
    });
    expect(client.projectMembership).toHaveBeenCalledTimes(2);

    // Inferred probes are remembered: no reopening, and the gap stays visible.
    const second = await manager.workspaceSymbol("Widget");
    expect(second).toMatchObject({ kind: "partial" });
    expect(client.documentSymbols).toHaveBeenCalledTimes(2);
  });

  it("does not let an inferred-project hit end a later search as complete", async () => {
    const root = makeTempRoot();
    rmSync(join(root, "src"), { recursive: true, force: true });
    const toolFile = join(root, ".tool.ts");
    writeFileSync(toolFile, "export const ToolWidget = 1;\n");
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
    const toolSymbol = {
      name: "ToolWidget",
      kind: 13,
      location: { uri: fileToUri(toolFile), range: { start: {}, end: {} } },
    };
    const client = {
      name: "typescript",
      root,
      status: "running",
      serverCapabilities: { workspaceSymbolProvider: true },
      workspaceSymbol: vi
        .fn()
        .mockResolvedValueOnce(completedCodeQuery([]))
        .mockResolvedValue(completedCodeQuery([toolSymbol])),
      documentSymbols: vi.fn().mockResolvedValue(completedCodeQuery([])),
      hover: vi.fn(),
      projectMembership: vi.fn().mockResolvedValue("inferred"),
    };
    getClients(manager).set(`typescript:${root}`, client);
    vi.spyOn(manager, "ensureFileOpen").mockResolvedValue(client as never);

    await expect(manager.workspaceSymbol("Widget")).resolves.toMatchObject({ kind: "partial" });
    // The inferred file's own symbol now matches, but the configured program
    // is still unsearched, so the result must stay partial.
    await expect(manager.workspaceSymbol("Widget")).resolves.toMatchObject({
      kind: "partial",
      data: [toolSymbol],
    });
  });

  it("keeps a configured-project empty result complete", async () => {
    const root = makeTempRoot();
    writeFileSync(join(root, "knip.config.ts"), "export default {};\n");
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
      serverCapabilities: { workspaceSymbolProvider: true },
      workspaceSymbol: vi.fn().mockResolvedValue(completedCodeQuery([])),
      documentSymbols: vi.fn().mockResolvedValue(completedCodeQuery([])),
      hover: vi.fn(),
      projectMembership: vi.fn().mockResolvedValue("configured"),
    };
    getClients(manager).set(`typescript:${root}`, client);
    vi.spyOn(manager, "ensureFileOpen").mockResolvedValue(client as never);

    await expect(manager.workspaceSymbol("Missing")).resolves.toEqual({
      kind: "completed",
      data: [],
    });
    // The confirmed root stops further candidates.
    expect(client.documentSymbols).toHaveBeenCalledTimes(1);
    await expect(manager.workspaceSymbol("Missing")).resolves.toEqual({
      kind: "completed",
      data: [],
    });
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
      projectMembership: vi.fn().mockResolvedValue("configured"),
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
    expect(ensureFileOpen).toHaveBeenCalledWith(join(root, "src", "index.ts"), {
      control: undefined,
    });
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
