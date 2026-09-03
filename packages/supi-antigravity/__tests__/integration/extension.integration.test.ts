import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { writeSupiConfig } from "@mrclrchtr/supi-core/config";
import { createPiMock, getHandlerOrThrow, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANTIGRAVITY_CONFIG_SECTION } from "../../src/config.ts";
import { ANTIGRAVITY_HANDLE_ENTRY_TYPE } from "../../src/conversation/handles.ts";
import antigravityExtension from "../../src/extension.ts";
import { fixtureDirectory } from "../helpers/test-paths.ts";

type RegisteredTool = {
  name: string;
  execute: (
    ...args: unknown[]
  ) => Promise<{ content: Array<{ type: string; text?: string }>; details?: unknown }>;
};

const fakeDirectory = fixtureDirectory(import.meta.dirname);
const roots: string[] = [];

beforeEach(() => {
  vi.stubEnv("PATH", `${fakeDirectory}:${process.env.PATH ?? ""}`);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup(): Promise<{ root: string; cwd: string }> {
  const root = await mkdtemp(join(tmpdir(), "supi-antigravity-extension-"));
  const cwd = join(root, "repo");
  await mkdir(cwd, { recursive: true });
  roots.push(root);
  vi.stubEnv("PI_CODING_AGENT_DIR", root);
  return { root, cwd };
}

describe("supi-antigravity extension", () => {
  it("omits the tool and warnings when disabled", async () => {
    const { root, cwd } = await setup();
    writeSupiConfig(
      { section: ANTIGRAVITY_CONFIG_SECTION, scope: "project", cwd },
      { agentToolEnabled: false },
      { homeDir: root },
    );
    const pi = createPiMock();
    antigravityExtension(pi as unknown as ExtensionAPI);
    const context = makeCtx({ cwd, sessionManager: { getBranch: () => [] } });
    await getHandlerOrThrow(pi, "session_start")(
      { type: "session_start", reason: "startup" },
      context,
    );
    expect(pi.tools).toHaveLength(0);
    expect(context.ui.notify).not.toHaveBeenCalled();
  });

  it("omits the tool and warns when agy is missing", async () => {
    const { cwd } = await setup();
    vi.stubEnv("PATH", "/usr/bin:/bin");
    const pi = createPiMock();
    antigravityExtension(pi as unknown as ExtensionAPI);
    const context = makeCtx({ cwd, sessionManager: { getBranch: () => [] } });
    await getHandlerOrThrow(pi, "session_start")(
      { type: "session_start", reason: "startup" },
      context,
    );
    expect(pi.tools).toHaveLength(0);
    expect(context.ui.notify).toHaveBeenCalledWith(expect.stringContaining("not found"), "warning");
  });

  it("warns before a workspace run when project hooks are active", async () => {
    const { cwd } = await setup();
    await writeFile(join(cwd, ".agy-hooks-active"), "active\\n");
    const pi = createPiMock();
    antigravityExtension(pi as unknown as ExtensionAPI);
    const context = makeCtx({ cwd, sessionManager: { getBranch: () => [] } });
    await getHandlerOrThrow(pi, "session_start")(
      { type: "session_start", reason: "startup" },
      context,
    );
    const tool = pi.tools[0] as RegisteredTool;
    await tool.execute(
      "call-hooks",
      {
        prompt: "require-add-dir workspace",
        new: { workspace: true, model: "gemini-3.8-flash-low" },
      },
      undefined,
      undefined,
      context,
    );
    expect(context.ui.notify).toHaveBeenCalledWith(expect.stringContaining("hooks"), "warning");
  });

  it("rejects overlap on one handle while allowing independent runs", async () => {
    const { cwd } = await setup();
    const pi = createPiMock();
    antigravityExtension(pi as unknown as ExtensionAPI);
    const context = makeCtx({ cwd, sessionManager: { getBranch: () => [] } });
    await getHandlerOrThrow(pi, "session_start")(
      { type: "session_start", reason: "startup" },
      context,
    );
    const tool = pi.tools[0] as RegisteredTool;
    const first = await tool.execute(
      "call-first",
      {
        prompt: "first",
        new: { workspace: false, model: "gemini-3.8-flash-low" },
      },
      undefined,
      undefined,
      context,
    );
    const handle = (first.details as { handle: string }).handle;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const running = tool.execute(
      "call-running",
      { prompt: "delay follow", continue: { handle } },
      undefined,
      (update: { details?: unknown }) => {
        if (update.details && typeof update.details === "object") started();
      },
      context,
    );
    await startedPromise;
    await expect(
      tool.execute(
        "call-overlap",
        { prompt: "overlap", continue: { handle } },
        undefined,
        undefined,
        context,
      ),
    ).rejects.toThrow(/already in use/);
    await running;

    const independent = await Promise.all([
      tool.execute(
        "call-independent-1",
        { prompt: "parallel one", new: { workspace: false, model: "gemini-3.8-flash-low" } },
        undefined,
        undefined,
        context,
      ),
      tool.execute(
        "call-independent-2",
        { prompt: "parallel two", new: { workspace: false, model: "gemini-3.8-flash-low" } },
        undefined,
        undefined,
        context,
      ),
    ]);
    expect(independent).toHaveLength(2);
  });

  it("registers, runs, and continues the tool after discovery", async () => {
    const { cwd } = await setup();
    const pi = createPiMock();
    antigravityExtension(pi as unknown as ExtensionAPI);
    const context = makeCtx({ cwd, sessionManager: { getBranch: () => [] } });
    await getHandlerOrThrow(pi, "session_start")(
      { type: "session_start", reason: "startup" },
      context,
    );
    expect(pi.tools).toHaveLength(1);
    const tool = pi.tools[0] as RegisteredTool;
    expect(tool.name).toBe("antigravity_run");

    const first = await tool.execute(
      "call-1",
      {
        prompt: "require-no-add-dir first",
        new: { workspace: false, model: "gemini-3.8-flash-low" },
      },
      undefined,
      undefined,
      context,
    );
    const details = first.details as { handle: string; rawAntigravityId: string };
    expect(details.handle).not.toBe(details.rawAntigravityId);
    expect(pi.entries).toContainEqual({
      type: ANTIGRAVITY_HANDLE_ENTRY_TYPE,
      data: expect.objectContaining({ action: "created" }),
    });

    const followUp = await tool.execute(
      "call-2",
      {
        prompt: "require-no-add-dir follow this",
        continue: { handle: details.handle },
      },
      undefined,
      undefined,
      context,
    );
    expect(followUp.details).toEqual(expect.objectContaining({ handle: details.handle }));
    expect((followUp.details as { rawAntigravityId: string }).rawAntigravityId).toBe(
      "fake-conversation",
    );

    const workspaceFirst = await tool.execute(
      "call-workspace-1",
      {
        prompt: "require-add-dir workspace",
        new: { workspace: true, model: "gemini-3.8-flash-low" },
      },
      undefined,
      undefined,
      context,
    );
    const workspaceHandle = (workspaceFirst.details as { handle: string }).handle;
    const workspaceFollowUp = await tool.execute(
      "call-workspace-2",
      {
        prompt: "require-add-dir workspace follow",
        continue: { handle: workspaceHandle },
      },
      undefined,
      undefined,
      context,
    );
    expect(workspaceFollowUp.details).toEqual(
      expect.objectContaining({
        handle: workspaceHandle,
        workspaceUsed: true,
        observedToolNames: ["read_file"],
        observedWorkspaceEvidence: [expect.any(Object)],
      }),
    );

    await expect(
      tool.execute(
        "call-3",
        { prompt: "fail this follow-up", continue: { handle: details.handle } },
        undefined,
        undefined,
        context,
      ),
    ).rejects.toThrow();
    expect(pi.entries).toContainEqual({
      type: ANTIGRAVITY_HANDLE_ENTRY_TYPE,
      data: expect.objectContaining({ action: "retired", handle: details.handle }),
    });
    await expect(
      tool.execute(
        "call-4",
        { prompt: "again", continue: { handle: details.handle } },
        undefined,
        undefined,
        context,
      ),
    ).rejects.toThrow(/retired/);

    const branch = pi.entries.map((entry) => ({
      type: "custom",
      customType: entry.type,
      data: entry.data,
    }));
    const treeContext = makeCtx({ cwd, sessionManager: { getBranch: () => branch } });
    await getHandlerOrThrow(pi, "session_tree")(
      { type: "session_tree", newLeafId: "new", oldLeafId: "old" },
      treeContext,
    );
    await expect(
      tool.execute(
        "call-after-resume",
        { prompt: "again after resume", continue: { handle: details.handle } },
        undefined,
        undefined,
        treeContext,
      ),
    ).rejects.toThrow(/retired/);
    await getHandlerOrThrow(pi, "session_shutdown")(
      { type: "session_shutdown", reason: "quit" },
      treeContext,
    );
  });
});
