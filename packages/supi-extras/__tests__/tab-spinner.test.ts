import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import tabSpinner from "../src/tab-spinner.ts";

function createPiMock(sessionName?: string) {
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => Promise<unknown>>>();
  const eventHandlers = new Map<string, Array<(data: unknown) => void>>();
  return {
    on: (event: string, handler: (event: unknown, ctx: unknown) => Promise<unknown>) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    getHandlers: (event: string) => handlers.get(event) ?? [],
    getSessionName: () => sessionName,
    events: {
      on: (channel: string, handler: (data: unknown) => void) => {
        const list = eventHandlers.get(channel) ?? [];
        list.push(handler);
        eventHandlers.set(channel, list);
        return () => {
          const idx = list.indexOf(handler);
          if (idx !== -1) list.splice(idx, 1);
        };
      },
      emit: (channel: string, data: unknown) => {
        for (const handler of eventHandlers.get(channel) ?? []) {
          handler(data);
        }
      },
    },
  };
}

function createCtxMock(cwd = "/tmp") {
  const titles: string[] = [];
  return {
    ui: {
      setTitle: (title: string) => {
        titles.push(title);
      },
    },
    cwd,
    getTitles: () => titles,
    clearTitles: () => {
      titles.length = 0;
    },
  };
}

describe("tabSpinner extension", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows spinner during agent_start and ✓ on agent_end", async () => {
    const pi = createPiMock("my-project");
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const startHandlers = pi.getHandlers("agent_start");
    const endHandlers = pi.getHandlers("agent_end");

    const ctx = createCtxMock();
    await startHandlers[0]({}, ctx);
    ctx.clearTitles();

    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()[0]).toMatch(/^⠋ π - my-project - tmp$/);

    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()[1]).toMatch(/^⠙ π - my-project - tmp$/);

    await endHandlers[0]({}, ctx);
    expect(ctx.getTitles()[ctx.getTitles().length - 1]).toBe("✓ π - my-project - tmp");
  });

  it("defaults to PI's computed title when no session name is set", async () => {
    const pi = createPiMock();
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const startHandlers = pi.getHandlers("agent_start");
    const endHandlers = pi.getHandlers("agent_end");

    const ctx = createCtxMock();
    await startHandlers[0]({}, ctx);
    ctx.clearTitles();

    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()[0]).toMatch(/^⠋ π - tmp$/);

    await endHandlers[0]({}, ctx);
    expect(ctx.getTitles()[ctx.getTitles().length - 1]).toBe("✓ π - tmp");
  });

  it("picks up session name changes between agent runs", async () => {
    const pi = createPiMock("first-name");
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const startHandlers = pi.getHandlers("agent_start");
    const endHandlers = pi.getHandlers("agent_end");

    const ctx = createCtxMock();
    await startHandlers[0]({}, ctx);
    ctx.clearTitles();
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()[0]).toMatch(/^⠋ π - first-name - tmp$/);

    await endHandlers[0]({}, ctx);
    expect(ctx.getTitles()[ctx.getTitles().length - 1]).toBe("✓ π - first-name - tmp");

    // Simulate /name rename
    pi.getSessionName = () => "second-name";

    ctx.clearTitles();
    await startHandlers[0]({}, ctx);
    ctx.clearTitles();
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()[0]).toMatch(/^⠋ π - second-name - tmp$/);
  });

  it("clears interval on session_shutdown", async () => {
    const pi = createPiMock("my-project");
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const startHandlers = pi.getHandlers("agent_start");
    const shutdownHandlers = pi.getHandlers("session_shutdown");

    const ctx = createCtxMock();
    await startHandlers[0]({}, ctx);
    ctx.clearTitles();
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()).toHaveLength(1);

    await shutdownHandlers[0]({}, ctx);
    expect(ctx.getTitles()[ctx.getTitles().length - 1]).toBe("π - my-project - tmp");

    // Further timer ticks should not produce new titles
    vi.advanceTimersByTime(200);
    expect(ctx.getTitles().length).toBeLessThanOrEqual(2);
  });

  it("does not double-start when agent_start fires twice", async () => {
    const pi = createPiMock("my-project");
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const startHandlers = pi.getHandlers("agent_start");

    const ctx = createCtxMock();
    await startHandlers[0]({}, ctx);
    ctx.clearTitles();
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()).toHaveLength(1); // one spinner tick

    // Second agent_start increments refcount but does not restart timer
    await startHandlers[0]({}, ctx);
    ctx.clearTitles();
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()).toHaveLength(1);
  });

  it("shows spinner during supi-review and restores on supi-review:end", async () => {
    const pi = createPiMock("my-project");
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const startHandlers = pi.getHandlers("agent_start");
    const endHandlers = pi.getHandlers("agent_end");

    const ctx = createCtxMock();
    await startHandlers[0]({}, ctx);
    ctx.clearTitles();
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()[0]).toMatch(/^⠋ π - my-project - tmp$/);

    // Agent end shows ✓, not plain restore
    await endHandlers[0]({}, ctx);
    expect(ctx.getTitles()[ctx.getTitles().length - 1]).toBe("✓ π - my-project - tmp");
    ctx.clearTitles();

    // Review starts without an active agent turn
    pi.events.emit("supi:working:start", { source: "supi-review" });
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()[0]).toMatch(/^⠋ π - my-project - tmp$/);

    // supi:working:end restores plain title (no ✓)
    pi.events.emit("supi:working:end", { source: "supi-review" });
    expect(ctx.getTitles()[ctx.getTitles().length - 1]).toBe("π - my-project - tmp");
  });

  it("keeps spinner running when review ends while agent is still active", async () => {
    const pi = createPiMock("my-project");
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const startHandlers = pi.getHandlers("agent_start");
    const endHandlers = pi.getHandlers("agent_end");

    const ctx = createCtxMock();
    await startHandlers[0]({}, ctx);
    ctx.clearTitles();

    // Review starts during active agent turn
    pi.events.emit("supi:working:start", { source: "supi-review" });
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()[0]).toMatch(/^⠋ π - my-project - tmp$/);

    // Review ends but agent is still running — spinner should continue
    pi.events.emit("supi:working:end", { source: "supi-review" });
    ctx.clearTitles();
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()[0]).toMatch(/^⠙ π - my-project - tmp$/);

    // Only when agent ends should the spinner stop — shows ✓
    await endHandlers[0]({}, ctx);
    expect(ctx.getTitles()[ctx.getTitles().length - 1]).toBe("✓ π - my-project - tmp");
  });

  it("handles supi-review:start before any agent_start by using a prior ctx", async () => {
    const pi = createPiMock("my-project");
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const startHandlers = pi.getHandlers("agent_start");
    const endHandlers = pi.getHandlers("agent_end");

    const ctx = createCtxMock();
    await startHandlers[0]({}, ctx);
    await endHandlers[0]({}, ctx);
    ctx.clearTitles();

    // Review starts after agent has finished — ctx is still known
    pi.events.emit("supi:working:start", { source: "supi-review" });
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()[0]).toMatch(/^⠋ π - my-project - tmp$/);

    pi.events.emit("supi:working:end", { source: "supi-review" });
    expect(ctx.getTitles()[ctx.getTitles().length - 1]).toBe("π - my-project - tmp");
  });

  it("pauses spinner on supi:ask-user:start and resumes on supi:ask-user:end", async () => {
    const pi = createPiMock("my-project");
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const startHandlers = pi.getHandlers("agent_start");
    const ctx = createCtxMock();
    await startHandlers[0]({}, ctx);
    ctx.clearTitles();
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()).toHaveLength(1); // one tick before pause

    // Pause: no titles should appear after this
    pi.events.emit("supi:ask-user:start", { source: "supi-ask-user" });
    ctx.clearTitles();
    vi.advanceTimersByTime(200);
    expect(ctx.getTitles()).toHaveLength(0);

    // Resume: spinner should start ticking again (continues from stored frame)
    pi.events.emit("supi:ask-user:end", { source: "supi-ask-user" });
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()).toHaveLength(1);
    expect(ctx.getTitles()[0]).toMatch(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] π - my-project - tmp$/);
  });

  it("unbalanced supi:working:end does not stop spinner while agent is active", async () => {
    const pi = createPiMock("my-project");
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const startHandlers = pi.getHandlers("agent_start");
    const endHandlers = pi.getHandlers("agent_end");

    const ctx = createCtxMock();
    await startHandlers[0]({}, ctx);
    ctx.clearTitles();
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()[0]).toMatch(/^⠋ π - my-project - tmp$/);

    // An unbalanced end (no matching start) should not drop below the agent's floor
    pi.events.emit("supi:working:end", { source: "supi-review" });
    ctx.clearTitles();
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()[0]).toMatch(/^⠙ π - my-project - tmp$/);

    // agent_end still shows ✓ when agent finishes
    await endHandlers[0]({}, ctx);
    expect(ctx.getTitles()[ctx.getTitles().length - 1]).toBe("✓ π - my-project - tmp");
  });
});
