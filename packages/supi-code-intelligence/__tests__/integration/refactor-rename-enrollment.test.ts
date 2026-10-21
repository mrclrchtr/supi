import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { LspRuntimeController } from "@mrclrchtr/supi-lsp/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceCodeIntelligenceSession } from "../../src/session/session.ts";
import { writeIsolatedFixtureConfig } from "../helpers/public-lsp-config.ts";

const FIXTURE = resolve(import.meta.dirname, "../fixtures/lsp-rename-enrollment-server.mjs");

async function startWorkspace() {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "rename-enrollment-")));
  const source = join(cwd, "model.test");
  const reference = join(cwd, "use.test");
  const release = join(cwd, "release");
  const homeDir = join(cwd, ".test-home");
  const runtime = getDefaultWorkspaceRuntime();
  const controller = new LspRuntimeController(cwd, runtime, { homeDir });
  try {
    writeFileSync(join(cwd, "project.marker"), "");
    writeFileSync(source, "function oldName() {}\n");
    writeIsolatedFixtureConfig(cwd, {
      args: [FIXTURE, source, reference, release],
      fileTypes: ["test"],
    });
    const started = await controller.start();
    if (started.kind !== "ready") throw new Error(`Fixture did not start: ${started.kind}`);
    const session = new WorkspaceCodeIntelligenceSession(cwd);
    session.setHomeDir(homeDir);
    const target = await session.resolve({
      target: { anchor: { file: source, line: 1, character: 10 } },
    });
    if (target.kind !== "resolved") throw new Error(`Target did not resolve: ${target.kind}`);
    // Keep this file outside the first request's open-document snapshot.
    writeFileSync(reference, "oldName();\n");
    expect(started.runtime.getOpenDocumentVersion(reference)).toBeNull();
    return {
      source,
      reference,
      session,
      runtime: started.runtime,
      targetId: target.entry.targetId,
      release: () => writeFileSync(release, ""),
      dispose: async () => {
        await controller.shutdown();
        runtime.clearWorkspace(cwd);
        rmSync(cwd, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await controller.shutdown();
    runtime.clearWorkspace(cwd);
    rmSync(cwd, { recursive: true, force: true });
    throw error;
  }
}

describe("rename planning across document enrollment", () => {
  let workspace: Awaited<ReturnType<typeof startWorkspace>> | undefined;
  let pending: Promise<unknown> | undefined;

  afterEach(async () => {
    workspace?.release();
    await pending?.catch(() => undefined);
    await workspace?.dispose();
    workspace = undefined;
    pending = undefined;
  });

  async function beginRename(active: Awaited<ReturnType<typeof startWorkspace>>) {
    const plan = active.session.planRefactor(
      {
        target: { handle: active.targetId },
        operation: { rename_symbol: { newName: "newName" } },
      },
      { deadline: Date.now() + 10_000 },
    );
    pending = plan;
    void plan.catch(() => undefined);
    await vi.waitFor(
      () => expect(active.runtime.getOpenDocumentVersion(active.reference)).not.toBeNull(),
      { timeout: 5_000 },
    );
    return { plan };
  }

  it("rejects source changes between the first request and its enrollment retry", async () => {
    workspace = await startWorkspace();
    const { plan } = await beginRename(workspace);
    writeFileSync(workspace.source, "function badName() {}\n");
    writeFileSync(workspace.reference, "badName();\n");
    workspace.release();

    await expect(plan).resolves.toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("Semantic input changed"),
    });
    expect(readFileSync(workspace.source, "utf8")).toBe("function badName() {}\n");
    expect(readFileSync(workspace.reference, "utf8")).toBe("badName();\n");
  }, 15_000);

  it("rejects changes to another open input outside the rename edit set", async () => {
    workspace = await startWorkspace();
    const dependency = join(dirname(workspace.source), "dependency.test");
    writeFileSync(dependency, "const dependency = 1;\n");
    await expect(workspace.runtime.trackFile(dependency)).resolves.toBe(true);
    const { plan } = await beginRename(workspace);
    writeFileSync(dependency, "const dependency = 2;\n");
    workspace.release();

    await expect(plan).resolves.toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("Semantic input changed"),
    });
  }, 15_000);

  it("rejects an observed source change even when the original content is restored", async () => {
    workspace = await startWorkspace();
    const { plan } = await beginRename(workspace);
    writeFileSync(workspace.source, "function badName() {}\n");
    await expect(workspace.runtime.trackFile(workspace.source)).resolves.toBe(true);
    writeFileSync(workspace.source, "function oldName() {}\n");
    await expect(workspace.runtime.trackFile(workspace.source)).resolves.toBe(true);
    workspace.release();

    await expect(plan).resolves.toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("Semantic input changed"),
    });
  }, 15_000);

  it("plans and applies a cross-file rename when only enrollment changes the inputs", async () => {
    workspace = await startWorkspace();
    const { plan } = await beginRename(workspace);
    workspace.release();
    const planned = await plan;
    expect(planned.kind).toBe("completed");
    if (planned.kind !== "completed") throw new Error(`Planning returned ${planned.kind}`);
    expect(readFileSync(workspace.source, "utf8")).toBe("function oldName() {}\n");
    expect(readFileSync(workspace.reference, "utf8")).toBe("oldName();\n");

    await expect(
      workspace.session.applyRefactor({ planId: planned.plan.id }),
    ).resolves.toMatchObject({
      kind: "completed",
      result: { filesChanged: 2, totalEdits: 2 },
    });
    expect(readFileSync(workspace.source, "utf8")).toBe("function newName() {}\n");
    expect(readFileSync(workspace.reference, "utf8")).toBe("newName();\n");
  }, 15_000);
});
