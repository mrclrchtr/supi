import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { completedCodeQuery, unavailableCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { fileToUri } from "@mrclrchtr/supi-core/path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileChangeType } from "../../src/config/types.ts";
import { type BatchedRequestControl, RequestTimingBatch } from "../../src/debug-telemetry.ts";
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
  resetDebugRegistry();
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function getClients(manager: LspManager): Map<string, unknown> {
  return (manager as unknown as { clients: Map<string, unknown> }).clients;
}

const warmProbes = () =>
  getDebugEvents({ source: "lsp", category: "workspace-symbol.warm-probe" }).events;

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
    configureDebugRegistry({ enabled: true });

    const first = await manager.workspaceSymbol("Widget");
    expect(first).toMatchObject({
      kind: "partial",
      data: [],
      reason: expect.stringContaining("2 opened warm-up files loaded only inferred projects"),
    });
    expect(client.projectMembership).toHaveBeenCalledTimes(2);
    // A probe that did not load its root keeps its own event, naming the file.
    expect(warmProbes().map((event) => event.data)).toEqual([
      expect.objectContaining({ outcome: "inferred", file: expect.any(String) }),
      expect.objectContaining({ outcome: "inferred", file: expect.any(String) }),
    ]);

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

  it("loads every project root before reporting a TypeScript result complete", async () => {
    const root = makeTempRoot();
    const declare = (name: string) => {
      const file = join(root, "packages", name, "src", "index.ts");
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(join(root, "packages", name, "package.json"), JSON.stringify({ name }));
      writeFileSync(file, "export const Widget = 1;\n");
      return {
        name: "Widget",
        kind: 13,
        location: { uri: fileToUri(file), range: { start: {}, end: {} } },
      };
    };
    const symbols = [declare("a"), declare("b")];
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
    // Like tsserver, the client answers only from projects with an open file.
    const opened = new Set<string>();
    const client = {
      name: "typescript",
      root,
      status: "running",
      serverCapabilities: { workspaceSymbolProvider: true },
      workspaceSymbol: vi.fn(async () =>
        completedCodeQuery(symbols.filter((symbol) => opened.has(symbol.location.uri))),
      ),
      // Stand in for the transport, which adds each completed request to the batch.
      documentSymbols: vi.fn(async (_file: string, control?: BatchedRequestControl) => {
        control?.requestTimings?.add("textDocument/documentSymbol", 4);
        return completedCodeQuery([]);
      }),
      hover: vi.fn(),
      projectMembership: vi.fn().mockResolvedValue("configured"),
    };
    getClients(manager).set(`typescript:${root}`, client);
    const ensureFileOpen = vi
      .spyOn(manager, "ensureFileOpen")
      .mockImplementation(async (filePath: string) => {
        opened.add(fileToUri(filePath));
        return client as never;
      });
    // One project is already loaded, so the first request has an answering row.
    opened.add(symbols[0].location.uri);
    configureDebugRegistry({ enabled: true });

    // Concurrent first queries share one pass and both see every project. A
    // scope naming the workspace root selects the same roots as no scope.
    const results = await Promise.all([
      manager.workspaceSymbol("Widget"),
      manager.workspaceSymbol("Widget", undefined, [root]),
    ]);
    for (const result of results) expect(result).toEqual({ kind: "completed", data: symbols });
    // One persisted summary describes the shared pass; per-file probes stay debug-level.
    const passes = getDebugEvents({ source: "lsp", category: "workspace-symbol.warm-pass" }).events;
    expect(passes).toHaveLength(1);
    expect(passes[0]).toMatchObject({
      level: "info",
      data: { server: "typescript", roots: 3, loadedRoots: 3, failedProbes: 0, limited: false },
    });
    // The pass reports its probe requests as totals, not one event per request.
    expect(passes[0]?.data).toMatchObject({
      requests: {
        "textDocument/documentSymbol": { count: client.documentSymbols.mock.calls.length },
      },
    });
    // Probes that loaded their root are counted in the summary only.
    expect(warmProbes()).toEqual([]);
    const opens = ensureFileOpen.mock.calls.length;

    await expect(manager.workspaceSymbol("Widget")).resolves.toEqual({
      kind: "completed",
      data: symbols,
    });
    expect(ensureFileOpen).toHaveBeenCalledTimes(opens);
  });

  it("reports a TypeScript result at the server row limit as partial", async () => {
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
    const row = {
      name: "Widget",
      kind: 13,
      location: { uri: fileToUri(join(root, "src", "index.ts")), range: { start: {}, end: {} } },
    };
    const client = {
      name: "typescript",
      root,
      status: "running",
      serverCapabilities: { workspaceSymbolProvider: true },
      workspaceSymbol: vi.fn().mockResolvedValue(completedCodeQuery(Array(256).fill(row))),
      documentSymbols: vi.fn().mockResolvedValue(completedCodeQuery([])),
      hover: vi.fn(),
      projectMembership: vi.fn().mockResolvedValue("configured"),
    };
    getClients(manager).set(`typescript:${root}`, client);
    vi.spyOn(manager, "ensureFileOpen").mockResolvedValue(client as never);

    const result = await manager.workspaceSymbol("Widget");
    expect(result).toMatchObject({
      kind: "partial",
      reason: expect.stringContaining("Use a more specific query or a scope."),
    });
    // A truncated list must block automatic target selection.
    expect(result).not.toHaveProperty("metadata.exclusionOnly");

    // The limit applies before scope filtering: do not advise a scope the caller already set.
    const scoped = await manager.workspaceSymbol("Widget", undefined, [join(root, "src")]);
    expect(scoped).toMatchObject({
      kind: "partial",
      reason: expect.stringContaining("resolve the declaration by its file or position"),
    });
    expect(scoped).not.toMatchObject({ reason: expect.stringContaining("or a scope") });

    // A scope equal to the session root narrows nothing; code_find passes it by default.
    expect(await manager.workspaceSymbol("Widget", undefined, [root])).toMatchObject({
      reason: expect.stringContaining("Use a more specific query or a scope."),
    });

    // tsserver has no row limit, so the same row count is a complete answer.
    Object.assign(client, { typescriptSelection: { backend: "tsserver" } });
    expect(await manager.workspaceSymbol("Widget")).toMatchObject({ kind: "completed" });
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
    // An all-roots pass hands its probe requests the batch that collects their timings.
    const batched = { requestTimings: expect.any(RequestTimingBatch) };
    expect(client.documentSymbols).toHaveBeenCalledWith(join(root, "src", "index.ts"), batched);
    expect(client.hover).toHaveBeenCalledWith(
      join(root, "src", "index.ts"),
      { line: 0, character: 13 },
      batched,
    );
    expect(client.workspaceSymbol).toHaveBeenCalledTimes(2);

    await manager.workspaceSymbol("Widget");
    expect(ensureFileOpen).toHaveBeenCalledTimes(1);
  });
});

describe("LspManager.startWorkspaceSymbolWarmup", () => {
  /** A TypeScript route with three project roots; `releaseOpens` unblocks the gated opens. */
  function makeGatedWorkspace(onTransition?: (loadingProjects: boolean) => void) {
    const root = makeTempRoot();
    const declare = (name: string) => {
      const file = join(root, "packages", name, "src", "index.ts");
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(join(root, "packages", name, "package.json"), JSON.stringify({ name }));
      writeFileSync(file, "export const Widget = 1;\n");
      return {
        name: "Widget",
        kind: 13,
        location: { uri: fileToUri(file), range: { start: {}, end: {} } },
      };
    };
    const symbols = [declare("a"), declare("b")];
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
      (transition) => onTransition?.(transition.projectServers[0]?.loadingProjects === true),
    );
    // Like tsserver, the client answers only from projects with an open file.
    const opened = new Set<string>();
    const client = {
      name: "typescript",
      root,
      status: "running",
      ready: true,
      openFiles: [] as string[],
      serverCapabilities: { workspaceSymbolProvider: true },
      getReady: vi.fn().mockResolvedValue(undefined),
      getDiagnosticSnapshot: () => ({ entries: [], current: true, documents: [] }),
      notifyWorkspaceFileChanges: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      workspaceSymbol: vi.fn(async () =>
        completedCodeQuery(symbols.filter((symbol) => opened.has(symbol.location.uri))),
      ),
      documentSymbols: vi.fn().mockResolvedValue(completedCodeQuery([])),
      hover: vi.fn(),
      projectMembership: vi.fn().mockResolvedValue("configured"),
    };
    getClients(manager).set(`typescript:${root}`, client);
    let releaseOpens = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseOpens = resolve;
    });
    const ensureFileOpen = vi
      .spyOn(manager, "ensureFileOpen")
      .mockImplementation(async (filePath: string) => {
        await gate;
        opened.add(fileToUri(filePath));
        return client as never;
      });
    configureDebugRegistry({ enabled: true });
    const passes = () =>
      getDebugEvents({ source: "lsp", category: "workspace-symbol.warm-pass" }).events;
    return { manager, root, client, declare, symbols, ensureFileOpen, releaseOpens, passes };
  }

  it("loads every project before a query and completes a query that arrives mid-pass", async () => {
    const { manager, symbols, ensureFileOpen, releaseOpens, passes } = makeGatedWorkspace();

    const warmup = manager.startWorkspaceSymbolWarmup();
    await vi.waitFor(() => expect(ensureFileOpen).toHaveBeenCalledTimes(1));
    const duringPass = manager.workspaceSymbol("Widget");
    releaseOpens();

    await expect(duringPass).resolves.toEqual({ kind: "completed", data: symbols });
    await warmup;
    // The query joined the background pass instead of opening the roots again.
    expect(ensureFileOpen).toHaveBeenCalledTimes(3);
    expect(passes()).toHaveLength(1);

    await expect(manager.workspaceSymbol("Widget")).resolves.toEqual({
      kind: "completed",
      data: symbols,
    });
    expect(ensureFileOpen).toHaveBeenCalledTimes(3);
  });

  it("publishes the route as loading projects for the duration of the pass", async () => {
    const published: boolean[] = [];
    const { manager, ensureFileOpen, releaseOpens } = makeGatedWorkspace((loading) =>
      published.push(loading),
    );
    const loading = () => manager.getKnownProjectServers([])[0]?.loadingProjects === true;

    const warmup = manager.startWorkspaceSymbolWarmup();
    await vi.waitFor(() => expect(ensureFileOpen).toHaveBeenCalledTimes(1));
    expect(loading()).toBe(true);
    releaseOpens();
    await warmup;

    expect(loading()).toBe(false);
    // Consumers such as the footer learn about both ends of the pass.
    expect(published[0]).toBe(true);
    expect(published.at(-1)).toBe(false);
  });

  it("does not publish a route as loading projects while its server still starts", async () => {
    const { manager, client, ensureFileOpen, releaseOpens } = makeGatedWorkspace();
    let releaseReady = () => {};
    client.getReady.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseReady = resolve;
      }),
    );
    const loading = () => manager.getKnownProjectServers([])[0]?.loadingProjects === true;

    const warmup = manager.startWorkspaceSymbolWarmup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loading()).toBe(false);
    releaseReady();
    await vi.waitFor(() => expect(ensureFileOpen).toHaveBeenCalledTimes(1));
    expect(loading()).toBe(true);
    releaseOpens();
    await warmup;
  });

  it("collects again when the pass ends unrecorded while a query's first rows are in flight", async () => {
    const { manager, root, client, symbols, ensureFileOpen, releaseOpens } = makeGatedWorkspace();
    let releaseRows = () => {};
    const rowsGate = new Promise<void>((resolve) => {
      releaseRows = resolve;
    });
    // The server answers the first request from the projects loaded when it arrived: none.
    client.workspaceSymbol.mockImplementationOnce(async () => {
      await rowsGate;
      return completedCodeQuery([]);
    });

    const warmup = manager.startWorkspaceSymbolWarmup();
    await vi.waitFor(() => expect(ensureFileOpen).toHaveBeenCalledTimes(1));
    const query = manager.workspaceSymbol("Widget");
    await vi.waitFor(() => expect(client.workspaceSymbol).toHaveBeenCalledTimes(1));
    // The config change keeps the pass unrecorded, so the query runs its own
    // pass and finds every file already opened.
    manager.noteWorkspaceChanges([
      { uri: fileToUri(join(root, "tsconfig.json")), type: FileChangeType.Changed },
    ]);
    releaseOpens();
    await warmup;
    releaseRows();

    await expect(query).resolves.toEqual({ kind: "completed", data: symbols });
  });

  it("loads a project root added by a config change during the pass", async () => {
    const { manager, root, declare, symbols, ensureFileOpen, releaseOpens } = makeGatedWorkspace();

    const warmup = manager.startWorkspaceSymbolWarmup();
    await vi.waitFor(() => expect(ensureFileOpen).toHaveBeenCalledTimes(1));
    // The pass already chose its roots; this one arrives too late for it.
    symbols.push(declare("c"));
    const config = join(root, "packages", "c", "tsconfig.json");
    writeFileSync(config, "{}");
    manager.noteWorkspaceChanges([{ uri: fileToUri(config), type: FileChangeType.Created }]);
    releaseOpens();
    await warmup;

    await expect(manager.workspaceSymbol("Widget")).resolves.toEqual({
      kind: "completed",
      data: symbols,
    });
  });

  it("reports a query partial when a project config changes during its own pass", async () => {
    const { manager, root, ensureFileOpen, releaseOpens } = makeGatedWorkspace();

    const query = manager.workspaceSymbol("Widget");
    await vi.waitFor(() => expect(ensureFileOpen).toHaveBeenCalledTimes(1));
    manager.noteWorkspaceChanges([
      { uri: fileToUri(join(root, "tsconfig.json")), type: FileChangeType.Changed },
    ]);
    releaseOpens();

    await expect(query).resolves.toMatchObject({
      kind: "partial",
      reason: expect.stringContaining("a project config changed"),
    });
  });

  it("stops a running pass on shutdown", async () => {
    const { manager, ensureFileOpen, releaseOpens, passes } = makeGatedWorkspace();

    const warmup = manager.startWorkspaceSymbolWarmup();
    await vi.waitFor(() => expect(ensureFileOpen).toHaveBeenCalledTimes(1));
    await manager.shutdownAll();
    releaseOpens();
    await warmup;

    expect(ensureFileOpen).toHaveBeenCalledTimes(1);
    expect(passes()).toHaveLength(0);
  });

  it("stops a running pass when its route restarts", async () => {
    const { manager, root, client, ensureFileOpen, releaseOpens, passes } = makeGatedWorkspace();
    // The pass must already be stopped while the restart waits for the old client.
    client.shutdown.mockImplementation(async () => {
      releaseOpens();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // The replacement fails to start, so only the old route's pass could open more files.
    vi.spyOn(
      manager as unknown as { createClient: (...args: never[]) => unknown },
      "createClient",
    ).mockReturnValue({
      start: vi.fn().mockRejectedValue(new Error("start failed")),
      forceKill: vi.fn().mockResolvedValue(undefined),
    });

    const warmup = manager.startWorkspaceSymbolWarmup();
    await vi.waitFor(() => expect(ensureFileOpen).toHaveBeenCalledTimes(1));
    await manager.restartClientsForFiles([join(root, "src", "index.ts")]);
    releaseOpens();
    await warmup;

    expect(ensureFileOpen).toHaveBeenCalledTimes(1);
    expect(passes()).toHaveLength(0);
  });
});
