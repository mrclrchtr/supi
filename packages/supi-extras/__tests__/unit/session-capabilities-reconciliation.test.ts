import { initTheme } from "@earendil-works/pi-coding-agent";
import { footerContributions } from "@mrclrchtr/supi-core/footer-registry";
import {
  createEmptySessionCapabilityState,
  SESSION_CAPABILITIES_ENTRY,
  type SessionCapabilityState,
  sessionCapabilityState,
} from "@mrclrchtr/supi-core/session";
import { createPiMock, getHandlerOrThrow, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import sessionCapabilities from "../../src/session-capabilities.ts";

type Tool = {
  name: string;
  description: string;
  sourceInfo: { source: string; path: string; scope: "user"; origin: "package" };
};
type Selector = { handleInput(data: string): void };

function tool(name: string, source = "@example/tools"): Tool {
  return {
    name,
    description: `${name} description`,
    sourceInfo: { source, path: `/${name}.ts`, scope: "user", origin: "package" },
  };
}

function makeState(overrides: Partial<SessionCapabilityState> = {}): SessionCapabilityState {
  return {
    ...createEmptySessionCapabilityState(),
    ...overrides,
  };
}

function setupSession(
  id: string,
  active: string[],
  tools: Tool[] = [
    tool("tool-active"),
    tool("tool-unmanaged"),
    tool("tool-late"),
    {
      ...tool("read", "builtin"),
      sourceInfo: { source: "builtin", path: "<builtin:read>", scope: "user", origin: "package" },
    },
  ],
) {
  const entries: Array<Record<string, unknown>> = [];
  let activeNames = [...active];
  const pi = createPiMock();
  pi.getAllTools = vi.fn(() => tools);
  pi.getActiveTools = vi.fn(() => [...activeNames]);
  pi.setActiveTools = vi.fn((names: string[]) => {
    activeNames = [...names];
  });
  pi.appendEntry = vi.fn((customType: string, data: unknown) => {
    entries.push({ type: "custom", customType, data });
  });
  sessionCapabilities(pi as unknown as Parameters<typeof sessionCapabilities>[0]);

  const ctx = makeCtx({
    mode: "tui",
    sessionManager: {
      getSessionId: () => id,
      getSessionFile: () => undefined,
      getEntries: () => entries,
      getHeader: () => null,
    },
  });
  let selector: Selector | undefined;
  ctx.ui.custom = vi.fn(async (factory) => {
    selector = factory({ requestRender: vi.fn() }, ctx.ui.theme, {} as never, vi.fn()) as Selector;
    return undefined;
  });
  return {
    pi,
    ctx,
    entries,
    tools,
    getActive: () => activeNames,
    getSelector: () => selector,
  };
}

function saveState(entries: Array<Record<string, unknown>>, state: SessionCapabilityState): void {
  entries.push({ type: "custom", customType: SESSION_CAPABILITIES_ENTRY, data: state });
}

function command(pi: ReturnType<typeof createPiMock>) {
  return pi.getCommandHandler("supi-capabilities") as (
    args: string,
    context: unknown,
  ) => Promise<void>;
}

beforeAll(() => initTheme("dark"));

afterEach(() => {
  for (const id of [
    "capability-startup-gate",
    "capability-reset-gate",
    "capability-late-tool",
    "capability-tree-state",
  ]) {
    sessionCapabilityState.clear(id);
  }
  footerContributions.clear();
});

describe("session capability reconciliation", () => {
  it("does not activate a saved eligible tool outside the live startup tool set", async () => {
    const session = setupSession("capability-startup-gate", ["read", "bash"]);
    saveState(session.entries, makeState({ eligibleToolNames: ["tool-active"] }));
    await getHandlerOrThrow(session.pi, "session_start")(
      { type: "session_start", reason: "resume" },
      session.ctx,
    );

    expect(session.getActive()).toEqual(["read", "bash"]);
  });

  it("does not reset a saved capability denial into a tool excluded at startup", async () => {
    const session = setupSession("capability-reset-gate", ["read", "bash"]);
    saveState(
      session.entries,
      makeState({ eligibleToolNames: ["tool-active"], toolDenylist: ["tool-active"] }),
    );
    await getHandlerOrThrow(session.pi, "session_start")(
      { type: "session_start", reason: "resume" },
      session.ctx,
    );
    await command(session.pi)("", session.ctx);
    const selector = session.getSelector();
    for (const character of "Reset Tools") selector?.handleInput(character);
    selector?.handleInput("\r");
    selector?.handleInput("\r");

    expect(session.getActive()).toEqual(["read", "bash"]);
    expect(sessionCapabilityState.get("capability-reset-gate")?.toolDenylist).toEqual([]);
  });

  it("keeps missing tool restrictions until a late tool registers", async () => {
    const session = setupSession("capability-late-tool", ["read", "bash"]);
    saveState(
      session.entries,
      makeState({
        eligibleToolNames: ["tool-active", "tool-late"],
        initiallyInactiveToolNames: ["tool-inactive"],
        toolDenylist: ["tool-late"],
      }),
    );
    await getHandlerOrThrow(session.pi, "session_start")(
      { type: "session_start", reason: "resume" },
      session.ctx,
    );
    expect(sessionCapabilityState.get("capability-late-tool")).toMatchObject({
      eligibleToolNames: ["tool-active", "tool-late"],
      initiallyInactiveToolNames: ["tool-inactive"],
      toolDenylist: ["tool-late"],
    });

    session.tools.push(tool("tool-late"));
    session.pi.setActiveTools(["read", "bash", "tool-late"]);
    await getHandlerOrThrow(session.pi, "before_agent_start")(
      { systemPrompt: "", systemPromptOptions: { selectedTools: ["tool-late"] } },
      session.ctx,
    );

    expect(session.getActive()).toEqual(["read", "bash"]);
    expect(sessionCapabilityState.get("capability-late-tool")?.toolDenylist).toContain("tool-late");
  });

  it("restores only explicitly enabled capability tools after tree navigation", async () => {
    const session = setupSession("capability-tree-state", [
      "read",
      "bash",
      "tool-active",
      "tool-unmanaged",
    ]);
    await getHandlerOrThrow(session.pi, "session_start")(
      { type: "session_start", reason: "startup" },
      session.ctx,
    );
    await command(session.pi)("", session.ctx);
    let selector = session.getSelector();
    for (const character of "tool-active") selector?.handleInput(character);
    selector?.handleInput("\u001b[B");
    selector?.handleInput(" ");
    expect(sessionCapabilityState.get("capability-tree-state")?.toolDenylist).toEqual([
      "tool-active",
    ]);

    await command(session.pi)("", session.ctx);
    selector = session.getSelector();
    for (const character of "tool-active") selector?.handleInput(character);
    selector?.handleInput("\u001b[B");
    selector?.handleInput(" ");
    expect(sessionCapabilityState.get("capability-tree-state")?.toolEnabledNames).toEqual([
      "tool-active",
    ]);

    session.pi.setActiveTools(["read", "bash", "unrelated-tool"]);
    await getHandlerOrThrow(session.pi, "session_tree")(
      { type: "session_tree", newLeafId: "old-turn", oldLeafId: "new-turn" },
      session.ctx,
    );

    expect(session.getActive()).toEqual(["read", "bash", "unrelated-tool", "tool-active"]);
  });
});
