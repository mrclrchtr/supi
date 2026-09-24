import { initTheme } from "@earendil-works/pi-coding-agent";
import { footerContributions } from "@mrclrchtr/supi-core/footer-registry";
import {
  clearPendingSessionCapabilityForks,
  registerSessionCapabilitySkillProvider,
  SESSION_CAPABILITIES_ENTRY,
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
type Selector = { render(width: number): string[]; handleInput?(data: string): void };

function tool(name: string, source: string, path: string): Tool {
  return {
    name,
    description: `${name} description`,
    sourceInfo: { source, path, scope: "user", origin: "package" },
  };
}

function setupSession(options: { id?: string; tools?: Tool[]; active?: string[] } = {}) {
  const id = options.id ?? "capability-test";
  const entries: Array<Record<string, unknown>> = [];
  let active = options.active ?? ["read", "bash", "tool-active"];
  const tools = options.tools ?? [
    tool("tool-active", "@example/tools", "/one/tool.ts"),
    tool("tool-inactive", "@example/tools", "/two/tool.ts"),
    {
      ...tool("read", "builtin", "<builtin:read>"),
      sourceInfo: { source: "builtin", path: "<builtin:read>", scope: "user", origin: "package" },
    },
  ];
  const pi = createPiMock();
  pi.getAllTools = vi.fn(() => tools);
  pi.getActiveTools = vi.fn(() => [...active]);
  pi.setActiveTools = vi.fn((names: string[]) => {
    active = [...names];
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
  const done = vi.fn();
  ctx.ui.custom = vi.fn(async (factory) => {
    selector = factory({ requestRender: vi.fn() }, ctx.ui.theme, {} as never, done) as Selector;
    return undefined;
  });

  return { pi, ctx, entries, done, getActive: () => active, getSelector: () => selector };
}

beforeAll(() => initTheme("dark"));

afterEach(() => {
  for (const id of [
    "capability-test",
    "capability-package-test",
    "capability-skill-test",
    "capability-footer-test",
    "capability-lifecycle-test",
    "capability-fork-test",
    "capability-reset-test",
    "capability-prune-test",
  ]) {
    sessionCapabilityState.clear(id);
  }
  clearPendingSessionCapabilityForks();
  footerContributions.clear();
});

describe("session capability controls", () => {
  it("does not expose inactive or built-in tools and keeps the selector open after a change", async () => {
    const { pi, ctx, done, getActive, getSelector } = setupSession();
    const start = getHandlerOrThrow(pi, "session_start");
    await start({ type: "session_start", reason: "startup" }, ctx);

    const command = pi.getCommandHandler("supi-capabilities") as (
      args: string,
      context: unknown,
    ) => Promise<void>;
    await command("", ctx);

    const selector = getSelector();
    expect(selector).toBeDefined();
    expect(selector?.render(120).join("\n")).toContain("tool-active");
    expect(selector?.render(120).join("\n")).not.toContain("tool-inactive");
    expect(selector?.render(120).join("\n")).not.toContain("read description");

    selector?.handleInput?.("tool-active");
    selector?.handleInput?.("\u001b[B");
    selector?.handleInput?.(" ");

    expect(getActive()).toEqual(["read", "bash"]);
    expect(done).not.toHaveBeenCalled();
    expect(pi.getHandlers("tool_call")).toEqual([]);
  });

  it("toggles tools by PI source and resets the session override", async () => {
    const packageTools: Tool[] = [
      tool("tool-active", "@example/tools", "/one/tool.ts"),
      tool("tool-second", "@example/tools", "/two/tool.ts"),
      tool("tool-inactive", "@example/tools", "/three/tool.ts"),
      {
        ...tool("read", "builtin", "<builtin:read>"),
        sourceInfo: { source: "builtin", path: "<builtin:read>", scope: "user", origin: "package" },
      },
    ];
    const session = setupSession({
      id: "capability-package-test",
      tools: packageTools,
      active: ["read", "bash", "tool-active", "tool-second"],
    });
    const start = getHandlerOrThrow(session.pi, "session_start");
    await start({ type: "session_start", reason: "startup" }, session.ctx);
    const command = session.pi.getCommandHandler("supi-capabilities") as (
      args: string,
      context: unknown,
    ) => Promise<void>;

    await command("", session.ctx);
    let selector = session.getSelector();
    for (const character of "@example/tools") selector?.handleInput?.(character);
    selector?.handleInput?.("\r");
    selector?.handleInput?.("\r");

    expect(session.getActive()).toEqual(["read", "bash"]);
    expect(session.done).not.toHaveBeenCalled();

    await command("", session.ctx);
    selector = session.getSelector();
    for (const character of "Reset Tools") selector?.handleInput?.(character);
    selector?.handleInput?.("\r");
    selector?.handleInput?.("\r");

    expect(session.getActive()).toEqual(["read", "bash", "tool-active", "tool-second"]);
    expect(session.entries.at(-1)?.data).toMatchObject({
      initiallyInactiveToolNames: ["tool-inactive"],
      toolDenylist: [],
    });
  });

  it("hides skills for this session and can reset the skill overrides", async () => {
    const session = setupSession({ id: "capability-skill-test" });
    const dispose = registerSessionCapabilitySkillProvider("capability-skill-test", {
      listEligibleSkills: () => [{ name: "visible-skill", description: "A visible skill" }],
    });
    const start = getHandlerOrThrow(session.pi, "session_start");
    await start({ type: "session_start", reason: "startup" }, session.ctx);
    const command = session.pi.getCommandHandler("supi-capabilities") as (
      args: string,
      context: unknown,
    ) => Promise<void>;

    await command("", session.ctx);
    let selector = session.getSelector();
    selector?.handleInput?.("\t");
    for (const character of "visible-skill") selector?.handleInput?.(character);
    selector?.handleInput?.(" ");

    expect(sessionCapabilityState.get("capability-skill-test")?.hiddenSkillNames).toEqual([
      "visible-skill",
    ]);

    await command("", session.ctx);
    selector = session.getSelector();
    selector?.handleInput?.("\t");
    for (const character of "Reset Skills") selector?.handleInput?.(character);
    selector?.handleInput?.("\r");
    selector?.handleInput?.("\r");

    expect(sessionCapabilityState.get("capability-skill-test")?.hiddenSkillNames).toEqual([]);
    dispose();
  });

  it("restores saved state on resume and copies it to an in-memory fork", async () => {
    const session = setupSession({ id: "capability-lifecycle-test" });
    const start = getHandlerOrThrow(session.pi, "session_start");
    const shutdown = getHandlerOrThrow(session.pi, "session_shutdown");
    const beforeFork = getHandlerOrThrow(session.pi, "session_before_fork");
    await start({ type: "session_start", reason: "startup" }, session.ctx);
    const command = session.pi.getCommandHandler("supi-capabilities") as (
      args: string,
      context: unknown,
    ) => Promise<void>;
    await command("", session.ctx);
    const selector = session.getSelector();
    for (const character of "tool-active") selector?.handleInput?.(character);
    selector?.handleInput?.("\u001b[B");
    selector?.handleInput?.(" ");
    expect(session.getActive()).toEqual(["read", "bash"]);

    await shutdown({ reason: "reload" }, session.ctx);
    session.pi.setActiveTools(["read", "bash", "tool-active"]);
    await start({ type: "session_start", reason: "resume" }, session.ctx);
    expect(session.getActive()).toEqual(["read", "bash"]);
    expect(sessionCapabilityState.get("capability-lifecycle-test")?.toolDenylist).toEqual([
      "tool-active",
    ]);

    const resumedState = sessionCapabilityState.get("capability-lifecycle-test");
    if (!resumedState) throw new Error("Session state was not restored");
    sessionCapabilityState.set("capability-lifecycle-test", {
      ...resumedState,
      hiddenSkillNames: ["review"],
    });
    await beforeFork({ type: "session_before_fork" }, session.ctx);
    await shutdown({ reason: "fork" }, session.ctx);
    session.pi.setActiveTools(["read", "bash", "tool-active"]);
    const forkCtx = makeCtx({
      mode: "tui",
      sessionManager: {
        getSessionId: () => "capability-fork-test",
        getSessionFile: () => undefined,
        getEntries: () => [],
        getHeader: () => null,
      },
    });
    await start({ type: "session_start", reason: "fork", previousSessionFile: undefined }, forkCtx);

    expect(session.getActive()).toEqual(["read", "bash"]);
    expect(sessionCapabilityState.get("capability-fork-test")).toMatchObject({
      toolDenylist: ["tool-active"],
      hiddenSkillNames: ["review"],
    });

    await shutdown({ reason: "switch" }, forkCtx);
    session.pi.setActiveTools(["read", "bash", "tool-active"]);
    await start({ type: "session_start", reason: "new" }, session.ctx);
    expect(session.getActive()).toEqual(["read", "bash", "tool-active"]);
    expect(sessionCapabilityState.get("capability-lifecycle-test")?.toolDenylist).toEqual([]);
  });

  it("keeps unresolved tool restrictions and prunes absent skills from the provider inventory", async () => {
    const session = setupSession({ id: "capability-prune-test" });
    const savedState = {
      version: 1 as const,
      eligibleToolNames: ["tool-active", "missing-tool"],
      initiallyInactiveToolNames: ["tool-inactive"],
      toolDenylist: ["tool-active", "missing-tool"],
      hiddenSkillNames: ["missing-skill"],
    };
    session.entries.push({
      type: "custom",
      customType: SESSION_CAPABILITIES_ENTRY,
      data: savedState,
    });
    const dispose = registerSessionCapabilitySkillProvider("capability-prune-test", {
      listEligibleSkills: () => [],
    });
    const start = getHandlerOrThrow(session.pi, "session_start");
    await start({ type: "session_start", reason: "resume" }, session.ctx);

    expect(sessionCapabilityState.get("capability-prune-test")).toMatchObject({
      eligibleToolNames: ["tool-active", "missing-tool"],
      initiallyInactiveToolNames: ["tool-inactive"],
      toolDenylist: ["tool-active", "missing-tool"],
      hiddenSkillNames: ["missing-skill"],
    });

    const command = session.pi.getCommandHandler("supi-capabilities") as (
      args: string,
      context: unknown,
    ) => Promise<void>;
    await command("", session.ctx);

    expect(sessionCapabilityState.get("capability-prune-test")).toMatchObject({
      eligibleToolNames: ["tool-active", "missing-tool"],
      initiallyInactiveToolNames: ["tool-inactive"],
      toolDenylist: ["tool-active", "missing-tool"],
      hiddenSkillNames: [],
    });
    dispose();
  });

  it("resets tool and skill overrides together", async () => {
    const session = setupSession({ id: "capability-reset-test" });
    const dispose = registerSessionCapabilitySkillProvider("capability-reset-test", {
      listEligibleSkills: () => [{ name: "visible-skill", description: "A visible skill" }],
    });
    const start = getHandlerOrThrow(session.pi, "session_start");
    await start({ type: "session_start", reason: "startup" }, session.ctx);
    const command = session.pi.getCommandHandler("supi-capabilities") as (
      args: string,
      context: unknown,
    ) => Promise<void>;

    await command("", session.ctx);
    let selector = session.getSelector();
    for (const character of "tool-active") selector?.handleInput?.(character);
    selector?.handleInput?.("\u001b[B");
    selector?.handleInput?.(" ");
    selector?.handleInput?.("\t");
    for (const character of "visible-skill") selector?.handleInput?.(character);
    selector?.handleInput?.(" ");
    expect(sessionCapabilityState.get("capability-reset-test")).toMatchObject({
      toolDenylist: ["tool-active"],
      hiddenSkillNames: ["visible-skill"],
    });

    await command("", session.ctx);
    selector = session.getSelector();
    for (const character of "Reset All") selector?.handleInput?.(character);
    selector?.handleInput?.("\r");
    selector?.handleInput?.("\r");

    expect(session.getActive()).toEqual(["read", "bash", "tool-active"]);
    expect(sessionCapabilityState.get("capability-reset-test")).toMatchObject({
      toolDenylist: [],
      hiddenSkillNames: [],
    });
    dispose();
  });

  it("shows a themed footer count and clears it after reset", async () => {
    const session = setupSession({ id: "capability-footer-test" });
    session.ctx.ui.theme.fg = vi.fn((color, text) => `<${color}>${text}</${color}>`);
    const start = getHandlerOrThrow(session.pi, "session_start");
    await start({ type: "session_start", reason: "startup" }, session.ctx);
    const command = session.pi.getCommandHandler("supi-capabilities") as (
      args: string,
      context: unknown,
    ) => Promise<void>;

    await command("", session.ctx);
    const selector = session.getSelector();
    for (const character of "tool-active") selector?.handleInput?.(character);
    selector?.handleInput?.("\u001b[B");
    selector?.handleInput?.(" ");

    expect(footerContributions.getByPlacement("stats-end")[0]?.render()).toContain("◈1");
    expect(session.ctx.ui.theme.fg).toHaveBeenCalledWith("accent", "◈1");
    const statusCall = vi.mocked(session.ctx.ui.setStatus).mock.lastCall;
    expect(statusCall?.[0]).toBe("supi-capabilities");
    expect(statusCall?.[1]).toContain("◈1");

    await command("", session.ctx);
    const resetSelector = session.getSelector();
    for (const character of "Reset Tools") resetSelector?.handleInput?.(character);
    resetSelector?.handleInput?.("\r");
    resetSelector?.handleInput?.("\r");

    expect(footerContributions.getByPlacement("stats-end")).toEqual([]);
    expect(session.ctx.ui.setStatus).toHaveBeenLastCalledWith("supi-capabilities", undefined);
  });
});
