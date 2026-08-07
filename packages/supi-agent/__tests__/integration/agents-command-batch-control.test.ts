import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type {
  AgentRunHandle,
  AgentRunOutcome,
  AgentRunProgress,
} from "@mrclrchtr/supi-agent-runtime/api";
import {
  createPiMock,
  getHandlerOrThrow,
  getTool,
  makeCtx,
  type ToolDef,
} from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import agentExtension from "../../src/extension.ts";
import { agentProfileCatalogueStore } from "../../src/session.ts";
import { registry } from "../../src/tool/agent-run-tool.ts";
import { context } from "../helpers/agent-run-fixtures.ts";

const mocks = vi.hoisted(() => ({
  handles: [] as ControlledHandle[],
}));

vi.mock("@mrclrchtr/supi-agent-runtime/api", () => ({
  createAgentRunProviderAuthority: vi.fn(() => ({
    getProvider: () => undefined,
    getProviderAuth: async () => undefined,
  })),
  combineAgentRunUsage: vi.fn(() => undefined),
  startAgentRun: vi.fn(() => {
    const handle = controlledHandle();
    mocks.handles.push(handle);
    return handle;
  }),
}));

interface ControlledHandle extends AgentRunHandle<string> {
  resolve: (outcome: AgentRunOutcome<string>) => void;
  stop: () => Promise<void>;
}

interface OverlayComponent {
  handleInput: (data: string) => void;
  dispose?: () => void;
}

function controlledHandle(): ControlledHandle {
  let resolve!: (outcome: AgentRunOutcome<string>) => void;
  const result = new Promise<AgentRunOutcome<string>>((done) => {
    resolve = done;
  });
  const listeners = new Set<(progress: AgentRunProgress) => void>();
  const handle = {
    result,
    resolve,
    subscribe: (listener: (progress: AgentRunProgress) => void) => {
      listeners.add(listener);
      listener({ status: "running", turns: 0, toolUses: 0, toolErrors: 0 });
      return () => listeners.delete(listener);
    },
    steer: vi.fn(async () => "accepted" as const),
    stop: vi.fn(async () => {
      resolve({
        kind: "canceled",
        diagnostics: {
          lifecycleTrace: { entries: [], droppedCount: 0 },
          turns: 0,
          toolUses: 0,
        },
      });
    }),
  };
  return handle;
}

afterEach(async () => {
  await registry.cancelAll();
  registry.clear();
  agentProfileCatalogueStore.clear();
  mocks.handles.length = 0;
  vi.clearAllMocks();
});

describe("/agents selected-run control with an active Delegation Batch", () => {
  it("stops only the selected run while the outer tool waits for its sibling", async () => {
    const pi = createPiMock();
    agentExtension(pi as unknown as ExtensionAPI);
    const start = getHandlerOrThrow(pi, "session_start");
    await start({ type: "session_start", reason: "startup" }, context());
    const tool = getTool(pi, "supi_agent_run") as ToolDef;

    let toolSettled = false;
    const toolPromise = Promise.resolve(
      tool.execute(
        "call-1",
        {
          tasks: [
            { id: "selected", profile: "explore", instructions: "Inspect selected" },
            { id: "sibling", profile: "explore", instructions: "Inspect sibling" },
          ],
        },
        undefined,
        undefined,
        context(),
      ),
    ).finally(() => {
      toolSettled = true;
    });
    await vi.waitFor(() => expect(mocks.handles).toHaveLength(2));

    let overlay: OverlayComponent | undefined;
    const base = makeCtx({ mode: "tui" });
    const custom = vi.fn(async (factory: (...args: unknown[]) => unknown) => {
      overlay = factory({ requestRender: vi.fn() }, base.ui.theme, {}, vi.fn()) as OverlayComponent;
    });
    const command = pi.getCommandHandler("agents") as (
      args: string,
      ctx: ReturnType<typeof makeCtx>,
    ) => Promise<void>;
    await command("", makeCtx({ ui: { ...base.ui, custom } }));

    overlay?.handleInput("x");
    await vi.waitFor(() => expect(mocks.handles[0]?.stop).toHaveBeenCalledOnce());

    expect(mocks.handles[1]?.stop).not.toHaveBeenCalled();
    expect(toolSettled).toBe(false);

    mocks.handles[1]?.resolve({ kind: "success", value: "Sibling finished" });
    const result = (await toolPromise) as {
      details: { tasks: Array<{ taskId: string; status: string }> };
    };
    expect(result.details.tasks).toMatchObject([
      { taskId: "selected", status: "canceled" },
      { taskId: "sibling", status: "completed" },
    ]);
    overlay?.dispose?.();
  });
});
