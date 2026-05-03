import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import tabSpinner from "../src/tab-spinner.ts";

function createPiMock(sessionName?: string) {
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => Promise<unknown>>>();
  return {
    on: (event: string, handler: (event: unknown, ctx: unknown) => Promise<unknown>) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    getHandlers: (event: string) => handlers.get(event) ?? [],
    getSessionName: () => sessionName,
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

  it("shows spinner during agent_start and restores on agent_end", async () => {
    const pi = createPiMock("my-project");
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const startHandlers = pi.getHandlers("agent_start");
    const endHandlers = pi.getHandlers("agent_end");

    const ctx = createCtxMock();
    await startHandlers[0]({}, ctx);
    // start() calls stop() first, which sets the base title
    ctx.clearTitles();

    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()[0]).toMatch(/^⠋ π - my-project - tmp$/);

    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()[1]).toMatch(/^⠙ π - my-project - tmp$/);

    await endHandlers[0]({}, ctx);
    expect(ctx.getTitles()[ctx.getTitles().length - 1]).toBe("π - my-project - tmp");
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
    expect(ctx.getTitles()[ctx.getTitles().length - 1]).toBe("π - tmp");
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
    expect(ctx.getTitles()[ctx.getTitles().length - 1]).toBe("π - first-name - tmp");

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

  it("stops previous timer before starting a new one", async () => {
    const pi = createPiMock("my-project");
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const startHandlers = pi.getHandlers("agent_start");

    const ctx = createCtxMock();
    await startHandlers[0]({}, ctx);
    ctx.clearTitles();
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()).toHaveLength(1); // one spinner tick

    // Start again without explicit stop — old timer should be cleared
    await startHandlers[0]({}, ctx);
    ctx.clearTitles();
    vi.advanceTimersByTime(80);
    // Only one spinner tick from the restarted interval
    expect(ctx.getTitles()).toHaveLength(1);
  });
});
