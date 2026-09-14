// Public WorkspaceLspRuntime semantic freshness integration tests.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LspConfig } from "../../src/config/types.ts";
import { LspManager } from "../../src/manager/manager.ts";
import { createWorkspaceLspRuntimeOwner } from "../../src/session/runtime-registry.ts";
import { waitFor } from "../helpers/integration-utils.ts";

const FIXTURE = path.resolve(import.meta.dirname, "../fixtures/lsp-semantic-server.mjs");

type LogEntry = { method: string; params?: unknown };

function readLog(logPath: string): LogEntry[] {
  try {
    return fs
      .readFileSync(logPath, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LogEntry);
  } catch {
    return [];
  }
}

function createConfig(
  logPath: string,
  responseDelayMs = 300,
  supportsDiagnostics = false,
): LspConfig {
  return {
    servers: {
      fixture: {
        command: process.execPath,
        args: [FIXTURE, logPath, String(responseDelayMs), ...(supportsDiagnostics ? ["pull"] : [])],
        fileTypes: ["test"],
        rootMarkers: ["project.marker"],
      },
    },
  };
}

function setupWorkspace(
  responseDelayMs = 300,
  supportsDiagnostics = false,
): {
  cwd: string;
  dependency: string;
  consumer: string;
  logPath: string;
  owner: ReturnType<typeof createWorkspaceLspRuntimeOwner>;
} {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-runtime-semantic-"));
  const dependency = path.join(cwd, "dependency.test");
  const consumer = path.join(cwd, "consumer.test");
  const logPath = path.join(cwd, "server.log");
  fs.writeFileSync(path.join(cwd, "project.marker"), "");
  fs.writeFileSync(dependency, "dependency-v1");
  fs.writeFileSync(consumer, "consumer-v1");
  fs.writeFileSync(logPath, "");
  const owner = createWorkspaceLspRuntimeOwner(
    new LspManager(createConfig(logPath, responseDelayMs, supportsDiagnostics), cwd),
  );
  return { cwd, dependency, consumer, logPath, owner };
}

describe("public WorkspaceLspRuntime semantic input barrier", () => {
  let workspace: ReturnType<typeof setupWorkspace> | undefined;

  afterEach(async () => {
    await workspace?.owner.shutdown();
    if (workspace) fs.rmSync(workspace.cwd, { recursive: true, force: true });
    workspace = undefined;
  });

  it("serves semantic routes before any diagnostic request", async () => {
    workspace = setupWorkspace(10, true);
    const { dependency, consumer, logPath, owner } = workspace;
    await owner.runtime.trackFile(dependency);
    await owner.runtime.trackFile(consumer);
    fs.writeFileSync(dependency, "dependency-semantic-v2");
    fs.writeFileSync(logPath, "");

    const [hover, definition, references, symbols, workspaceSymbols, rename, actions] =
      await Promise.all([
        owner.runtime.hover(consumer, { line: 0, character: 0 }),
        owner.runtime.definition(consumer, { line: 0, character: 0 }),
        owner.runtime.references(consumer, { line: 0, character: 0 }),
        owner.runtime.documentSymbols(consumer),
        owner.runtime.workspaceSymbol("consumer"),
        owner.runtime.rename(consumer, { line: 0, character: 0 }, "renamed"),
        owner.runtime.codeActions(consumer, { line: 0, character: 0 }),
      ]);

    expect(hover.kind).toBe("completed");
    expect(definition).toMatchObject({ kind: "completed", data: [] });
    expect(references).toMatchObject({ kind: "completed", data: [] });
    expect(symbols).toMatchObject({ kind: "completed", data: [] });
    expect(workspaceSymbols).toMatchObject({ kind: "completed", data: [] });
    expect(rename).toMatchObject({ value: null });
    expect(actions).toMatchObject({ value: [] });
    expect(
      readLog(logPath).filter((entry) => entry.method === "textDocument/didChange"),
    ).toHaveLength(1);
    expect(readLog(logPath)).not.toContainEqual(
      expect.objectContaining({ method: "textDocument/diagnostic" }),
    );

    const diagnostics = await owner.runtime.fileDiagnostics(consumer);
    expect(diagnostics).toMatchObject({ kind: "completed", data: [] });
    expect(
      readLog(logPath).filter((entry) => entry.method === "textDocument/diagnostic"),
    ).toHaveLength(1);
  });

  it("syncs changed open dependencies before hover without a diagnostic request", async () => {
    workspace = setupWorkspace();
    const { dependency, consumer, logPath, owner } = workspace;
    await expect(owner.runtime.trackFile(dependency)).resolves.toBe(true);
    await expect(owner.runtime.trackFile(consumer)).resolves.toBe(true);
    fs.writeFileSync(dependency, "dependency-v2");
    fs.writeFileSync(logPath, "");

    const result = await owner.runtime.hover(consumer, { line: 0, character: 0 });

    expect(result).toMatchObject({
      kind: "completed",
      data: { contents: { kind: "plaintext", value: "hover" } },
    });
    expect(
      readLog(logPath).filter((entry) => entry.method === "textDocument/didChange"),
    ).toHaveLength(1);
    expect(readLog(logPath)).not.toContainEqual(
      expect.objectContaining({ method: "textDocument/diagnostic" }),
    );
  });

  it("shares synchronization for concurrent semantic requests", async () => {
    workspace = setupWorkspace();
    const { dependency, consumer, logPath, owner } = workspace;
    await owner.runtime.trackFile(dependency);
    await owner.runtime.trackFile(consumer);
    fs.writeFileSync(dependency, "dependency-v2");
    fs.writeFileSync(logPath, "");

    const [hover, definitions] = await Promise.all([
      owner.runtime.hover(consumer, { line: 0, character: 0 }),
      owner.runtime.definition(consumer, { line: 0, character: 0 }),
    ]);

    expect(hover.kind).toBe("completed");
    expect(definitions).toMatchObject({ kind: "completed", data: [] });
    expect(
      readLog(logPath).filter((entry) => entry.method === "textDocument/didChange"),
    ).toHaveLength(1);
  });

  it("refreshes fresh evidence without resynchronizing unchanged consumers", async () => {
    workspace = setupWorkspace(10, true);
    const { dependency, consumer, logPath, owner } = workspace;
    await owner.runtime.trackFile(dependency);
    await owner.runtime.trackFile(consumer);
    await expect(owner.runtime.fileDiagnostics(consumer)).resolves.toMatchObject({
      kind: "completed",
      data: [],
    });

    fs.writeFileSync(dependency, "dependency-v2");
    owner.runtime.noteWorkspaceChanges([{ uri: `file://${dependency}`, type: 2 }]);
    fs.writeFileSync(logPath, "");

    await expect(
      owner.runtime.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 1 }),
    ).resolves.toMatchObject({ requested: 2, confirmed: 2, unconfirmed: 0, failed: 0 });

    const changes = readLog(logPath).filter((entry) => entry.method === "textDocument/didChange");
    expect(changes).toHaveLength(1);
    expect(changes[0]?.params).toMatchObject({
      textDocument: { uri: `file://${dependency}` },
      contentChanges: [{ text: "dependency-v2" }],
    });
  });

  it("fails closed when an open input is deleted", async () => {
    workspace = setupWorkspace();
    const { dependency, consumer, logPath, owner } = workspace;
    await owner.runtime.trackFile(dependency);
    await owner.runtime.trackFile(consumer);
    fs.rmSync(dependency);
    fs.writeFileSync(logPath, "");

    const result = await owner.runtime.hover(consumer, { line: 0, character: 0 });

    expect(result.kind).toBe("unavailable");
    await waitFor(
      async () => readLog(logPath),
      (entries) => entries.some((entry) => entry.method === "textDocument/didClose"),
      { timeoutMs: 5_000, label: "fixture close notification" },
    );
    expect(readLog(logPath)).toContainEqual(
      expect.objectContaining({ method: "textDocument/didClose" }),
    );
    expect(readLog(logPath)).not.toContainEqual(
      expect.objectContaining({ method: "textDocument/hover" }),
    );
  });

  it("fails closed when an open input cannot be read", async () => {
    workspace = setupWorkspace();
    const { dependency, consumer, logPath, owner } = workspace;
    await owner.runtime.trackFile(dependency);
    await owner.runtime.trackFile(consumer);
    fs.rmSync(dependency);
    fs.mkdirSync(dependency);
    fs.writeFileSync(logPath, "");

    const result = await owner.runtime.hover(consumer, { line: 0, character: 0 });

    expect(result.kind).toBe("unavailable");
    expect(readLog(logPath)).not.toContainEqual(
      expect.objectContaining({ method: "textDocument/hover" }),
    );
  });

  it("propagates cancellation after a semantic request starts", async () => {
    workspace = setupWorkspace();
    const { consumer, logPath, owner } = workspace;
    await owner.runtime.trackFile(consumer);
    const controller = new AbortController();
    const pending = owner.runtime.hover(
      consumer,
      { line: 0, character: 0 },
      {
        signal: controller.signal,
      },
    );
    const pendingOutcome = pending.then(
      () => undefined,
      (error: unknown) => error,
    );

    await waitFor(
      async () => readLog(logPath),
      (entries) => entries.some((entry) => entry.method === "textDocument/hover"),
      { timeoutMs: 5_000, label: "fixture cancellable hover request" },
    );
    controller.abort(new Error("semantic request cancelled"));

    await expect(pendingOutcome).resolves.toMatchObject({
      message: "semantic request cancelled",
    });
  });

  it("propagates a deadline after a semantic request starts", async () => {
    workspace = setupWorkspace(300);
    const { consumer, logPath, owner } = workspace;
    await owner.runtime.trackFile(consumer);
    const pending = owner.runtime.hover(
      consumer,
      { line: 0, character: 0 },
      { deadline: Date.now() + 25 },
    );
    const pendingOutcome = pending.then(
      () => undefined,
      (error: unknown) => error,
    );

    await waitFor(
      async () => readLog(logPath),
      (entries) => entries.some((entry) => entry.method === "textDocument/hover"),
      { timeoutMs: 5_000, label: "fixture deadline hover request" },
    );

    await expect(pendingOutcome).resolves.toMatchObject({
      message: "Code request deadline exceeded",
    });
  });

  it("rejects a semantic result after an open input closes", async () => {
    workspace = setupWorkspace();
    const { dependency, consumer, logPath, owner } = workspace;
    await owner.runtime.trackFile(dependency);
    await owner.runtime.trackFile(consumer);
    fs.writeFileSync(logPath, "");

    const pending = owner.runtime.hover(consumer, { line: 0, character: 0 });
    await waitFor(
      async () => readLog(logPath),
      (entries) => entries.some((entry) => entry.method === "textDocument/hover"),
      { timeoutMs: 5_000, label: "fixture lifecycle hover request" },
    );
    owner.runtime.closeFile(dependency);

    await expect(pending).resolves.toMatchObject({ kind: "unavailable" });
  });

  it("rejects a semantic result when an input changes during the request", async () => {
    workspace = setupWorkspace();
    const { dependency, consumer, logPath, owner } = workspace;
    await owner.runtime.trackFile(dependency);
    await owner.runtime.trackFile(consumer);
    fs.writeFileSync(logPath, "");

    const pending = owner.runtime.hover(consumer, { line: 0, character: 0 });
    await waitFor(
      async () => readLog(logPath),
      (entries) => entries.some((entry) => entry.method === "textDocument/hover"),
      { timeoutMs: 5_000, label: "fixture hover request" },
    );
    fs.writeFileSync(dependency, "dependency-v2");

    const result = await pending;
    expect(result.kind).toBe("unavailable");
    await waitFor(
      async () => readLog(logPath),
      (entries) => entries.some((entry) => entry.method === "textDocument/didChange"),
      { timeoutMs: 5_000, label: "fixture changed-input notification" },
    );
  });
});
