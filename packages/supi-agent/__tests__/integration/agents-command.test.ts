import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AgentRunProgress } from "@mrclrchtr/supi-agent-runtime/api";
import { createPiMock, getHandlerOrThrow, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import agentExtension from "../../src/extension.ts";
import { agentProfileCatalogueStore } from "../../src/session.ts";
import { registry } from "../../src/tool/agent-run-tool.ts";
import type { ActiveRunRegistration } from "../../src/tool/registry.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  registry.clear();
  agentProfileCatalogueStore.clear();
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

type OverlayComponent = {
  render: (width: number) => string[];
  handleInput: (data: string) => void;
  dispose?: () => void;
};

function runRegistration(
  taskId: string,
  status: AgentRunProgress["status"] = "running",
  steerResult: "accepted" | "not-running" = "accepted",
): {
  registration: ActiveRunRegistration;
  steer: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
} {
  const steer = vi.fn(async () => steerResult);
  const stop = vi.fn(async () => undefined);
  const handle = {
    result: new Promise<never>(() => undefined),
    subscribe: (listener: (progress: AgentRunProgress) => void) => {
      listener({ status, turns: 2, toolUses: 3, toolErrors: 0 });
      return () => undefined;
    },
    steer,
    stop,
  };
  return {
    registration: {
      taskId,
      profileId: "explore",
      modelId: "test/model",
      thinkingLevel: "medium",
      taskMetadata: { instructions: `Inspect ${taskId}`, sharedContext: "Shared context" },
      handle,
      getConversationView: (acceptedSteering) => ({
        taskId,
        profileId: "explore",
        entries: [
          { kind: "assistant", text: `Working on ${taskId}` },
          ...acceptedSteering.map((text) => ({ kind: "steering" as const, text })),
        ],
        omittedEntryCount: 0,
        omittedCharacterCount: 0,
        textTruncated: false,
        taskMetadata: { instructions: `Inspect ${taskId}`, sharedContext: "Shared context" },
      }),
      getRecentActivity: () => ["read src/index.ts"],
    },
    steer,
    stop,
  };
}

function captureOverlay(ctx: ReturnType<typeof makeCtx>): {
  custom: ReturnType<typeof vi.fn>;
  component: () => OverlayComponent;
} {
  let overlay: OverlayComponent | undefined;
  const custom = vi.fn(async (factory: (...args: unknown[]) => unknown) => {
    overlay = factory({ requestRender: vi.fn() }, ctx.ui.theme, {}, vi.fn()) as OverlayComponent;
  });
  return {
    custom,
    component: () => {
      if (!overlay) throw new Error("Overlay was not created");
      return overlay;
    },
  };
}

async function startExtension(options: { invalidProfile?: boolean } = {}) {
  const agentDir = await mkdtemp(join(tmpdir(), "supi-agent-command-"));
  temporaryDirectories.push(agentDir);
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  if (options.invalidProfile) {
    const directory = join(agentDir, "supi", "agents", "broken");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "profile.json"), "{", "utf8");
  }
  const pi = createPiMock();
  agentExtension(pi as unknown as ExtensionAPI);
  const start = getHandlerOrThrow(pi, "session_start");
  await start(
    { type: "session_start", reason: "startup" },
    makeCtx({ cwd: process.cwd(), isProjectTrusted: () => false }),
  );
  return pi;
}

describe("/agents command", () => {
  it("returns a concise unavailable notice outside TUI mode", async () => {
    const pi = await startExtension();
    const handler = pi.getCommandHandler("agents") as (
      args: string,
      ctx: ReturnType<typeof makeCtx>,
    ) => Promise<void>;
    const ctx = makeCtx({ mode: "print" });

    await handler("", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("/agents is available only in TUI mode.", "warning");
    expect(ctx.ui.custom).not.toHaveBeenCalled();
  });

  it("opens a no-run overlay in TUI mode", async () => {
    const pi = await startExtension();
    const handler = pi.getCommandHandler("agents") as (
      args: string,
      ctx: ReturnType<typeof makeCtx>,
    ) => Promise<void>;
    let rendered = "";
    const custom = vi.fn(async (factory: (...args: unknown[]) => unknown) => {
      const component = factory({ requestRender: vi.fn() }, makeCtx().ui.theme, {}, vi.fn()) as {
        render: (width: number) => string[];
        dispose?: () => void;
      };
      rendered = component.render(100).join("\n");
      component.dispose?.();
    });
    const ctx = makeCtx({ mode: "tui", ui: { ...makeCtx().ui, custom } });

    await handler("", ctx);

    expect(custom).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ overlay: true }),
    );
    expect(rendered).toContain("Agents");
    expect(rendered).toContain("No Agent Runs in this session");
  });

  it("shows active run details and retains accepted steering inline", async () => {
    const pi = await startExtension();
    const active = runRegistration("inspect");
    registry.register(active.registration);
    const handler = pi.getCommandHandler("agents") as (
      args: string,
      ctx: ReturnType<typeof makeCtx>,
    ) => Promise<void>;
    const base = makeCtx({ mode: "tui" });
    const captured = captureOverlay(base);
    const input = vi.fn(async () => "Focus on tests");
    const ctx = makeCtx({ ui: { ...base.ui, custom: captured.custom, input } });

    await handler("", ctx);
    const overlay = captured.component();
    expect(overlay.render(100).join("\n")).toContain("Working on inspect");
    expect(overlay.render(100).join("\n")).toContain("test/model");

    overlay.handleInput("s");
    await vi.waitFor(() => expect(active.steer).toHaveBeenCalledWith("Focus on tests"));
    await vi.waitFor(() =>
      expect(overlay.render(100).join("\n")).toContain("steering: Focus on tests"),
    );
    overlay.dispose?.();
  });

  it("represents a rejected steering request as not-running", async () => {
    const pi = await startExtension();
    const active = runRegistration("settling", "running", "not-running");
    registry.register(active.registration);
    const handler = pi.getCommandHandler("agents") as (
      args: string,
      ctx: ReturnType<typeof makeCtx>,
    ) => Promise<void>;
    const base = makeCtx({ mode: "tui" });
    const captured = captureOverlay(base);
    const ctx = makeCtx({
      ui: { ...base.ui, custom: captured.custom, input: vi.fn(async () => "Too late") },
    });

    await handler("", ctx);
    const overlay = captured.component();
    overlay.handleInput("s");

    await vi.waitFor(() =>
      expect(overlay.render(100).join("\n")).toContain("Selected run is not running"),
    );
    expect(registry.acceptedSteering("settling")).toEqual([]);
    overlay.dispose?.();
  });

  it("stops only the selected run and leaves its sibling active", async () => {
    const pi = await startExtension();
    const selected = runRegistration("selected");
    const sibling = runRegistration("sibling");
    registry.register(selected.registration);
    registry.register(sibling.registration);
    const handler = pi.getCommandHandler("agents") as (
      args: string,
      ctx: ReturnType<typeof makeCtx>,
    ) => Promise<void>;
    const base = makeCtx({ mode: "tui" });
    const captured = captureOverlay(base);
    const ctx = makeCtx({ ui: { ...base.ui, custom: captured.custom } });

    await handler("", ctx);
    captured.component().handleInput("x");

    await vi.waitFor(() => expect(selected.stop).toHaveBeenCalledOnce());
    expect(sibling.stop).not.toHaveBeenCalled();
    expect(registry.snapshot().activeRuns).toHaveLength(2);
    captured.component().dispose?.();
  });

  it("shows the last completed batch after active runs settle", async () => {
    const pi = await startExtension();
    const view = runRegistration("finished").registration.getConversationView([]);
    registry.setConversationView("finished", view);
    registry.completeBatch([
      {
        taskId: "finished",
        profileId: "explore",
        status: "completed",
        turns: 1,
        toolUses: 1,
        modelId: "test/model",
        thinkingLevel: "low",
        humanTruncated: false,
        modelTruncated: false,
        taskMetadata: view.taskMetadata,
      },
    ]);
    const handler = pi.getCommandHandler("agents") as (
      args: string,
      ctx: ReturnType<typeof makeCtx>,
    ) => Promise<void>;
    const base = makeCtx({ mode: "tui" });
    const captured = captureOverlay(base);
    const ctx = makeCtx({ ui: { ...base.ui, custom: captured.custom } });

    await handler("", ctx);

    const text = captured.component().render(100).join("\n");
    expect(text).toContain("finished");
    expect(text).toContain("completed");
    expect(text).toContain("last");
    captured.component().dispose?.();
  });

  it("shows effective profile provenance and bounded Profile Diagnostics", async () => {
    const pi = await startExtension({ invalidProfile: true });
    const handler = pi.getCommandHandler("agents") as (
      args: string,
      ctx: ReturnType<typeof makeCtx>,
    ) => Promise<void>;
    const base = makeCtx({ mode: "tui" });
    const captured = captureOverlay(base);
    const ctx = makeCtx({ ui: { ...base.ui, custom: captured.custom } });

    await handler("", ctx);
    const overlay = captured.component();
    overlay.handleInput("\t");
    expect(overlay.render(100).join("\n")).toContain("explore — package");
    overlay.handleInput("\t");
    const diagnostics = overlay.render(100).join("\n");
    expect(diagnostics).toContain("broken");
    expect(diagnostics).toContain("invalid-manifest");
    overlay.dispose?.();
  });

  it("clears overlay-accessible state on session shutdown", async () => {
    const pi = await startExtension();
    const active = runRegistration("active");
    registry.register(active.registration);
    const shutdown = getHandlerOrThrow(pi, "session_shutdown");

    await shutdown({ type: "session_shutdown", reason: "quit" }, makeCtx());

    expect(active.stop).toHaveBeenCalledOnce();
    expect(registry.snapshot()).toEqual({ activeRuns: [], lastBatch: undefined });
    expect(agentProfileCatalogueStore.get()).toBeUndefined();
  });
});
