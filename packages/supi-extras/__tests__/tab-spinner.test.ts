import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import tabSpinner from "../src/tab-spinner.ts";

function createPiMock() {
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => Promise<unknown>>>();
  return {
    on: (event: string, handler: (event: unknown, ctx: unknown) => Promise<unknown>) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    getHandlers: (event: string) => handlers.get(event) ?? [],
  };
}

function createCtxMock() {
  const titles: string[] = [];
  return {
    ui: {
      setTitle: (title: string) => {
        titles.push(title);
      },
      theme: {
        fg: (_color: string, text: string) => text,
      } as unknown as Record<string, unknown>,
    },
    cwd: "/tmp",
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

  it("patches setTitle on session_start", () => {
    const pi = createPiMock();
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const handlers = pi.getHandlers("session_start");
    expect(handlers).toHaveLength(1);

    const ctx = createCtxMock();
    handlers[0]({}, ctx);

    // After patching, calling setTitle should store the base title
    ctx.ui.setTitle("pi - my-project");
    expect(ctx.getTitles()).toContain("pi - my-project");
  });

  it("shows spinner during agent_start and restores on agent_end", async () => {
    const pi = createPiMock();
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const sessionHandlers = pi.getHandlers("session_start");
    const startHandlers = pi.getHandlers("agent_start");
    const endHandlers = pi.getHandlers("agent_end");

    expect(startHandlers).toHaveLength(1);
    expect(endHandlers).toHaveLength(1);

    const ctx = createCtxMock();
    await sessionHandlers[0]({}, ctx);
    ctx.clearTitles();

    // Set a custom title before agent starts
    ctx.ui.setTitle("pi - my-project");
    ctx.clearTitles();

    await startHandlers[0]({}, ctx);

    // First tick should show a spinner frame + base title
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()[0]).toMatch(/^⠋ pi - my-project$/);

    // Advance timer to next frame
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()[1]).toMatch(/^⠙ pi - my-project$/);

    // Agent ends — title should restore without spinner
    await endHandlers[0]({}, ctx);
    expect(ctx.getTitles()[ctx.getTitles().length - 1]).toBe("pi - my-project");
  });

  it("does not override external setTitle while spinning", async () => {
    const pi = createPiMock();
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const sessionHandlers = pi.getHandlers("session_start");
    const startHandlers = pi.getHandlers("agent_start");

    const ctx = createCtxMock();
    await sessionHandlers[0]({}, ctx);

    ctx.ui.setTitle("first-title");
    ctx.clearTitles();

    await startHandlers[0]({}, ctx);
    vi.advanceTimersByTime(80);
    const titleAfterStart = ctx.getTitles()[0];
    expect(titleAfterStart).toMatch(/^⠋ first-title$/);

    // While spinning, an external setTitle should update baseTitle
    // but not immediately render a non-spinner title
    const titlesBeforeExternal = ctx.getTitles().length;
    ctx.ui.setTitle("second-title");

    // No new title rendered immediately
    expect(ctx.getTitles().length).toBe(titlesBeforeExternal);

    // Next tick should use the new baseTitle
    vi.advanceTimersByTime(80);
    const latest = ctx.getTitles()[ctx.getTitles().length - 1];
    expect(latest).toMatch(/^⠙ second-title$/);
  });

  it("clears interval on session_shutdown", async () => {
    const pi = createPiMock();
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const sessionHandlers = pi.getHandlers("session_start");
    const startHandlers = pi.getHandlers("agent_start");
    const shutdownHandlers = pi.getHandlers("session_shutdown");

    const ctx = createCtxMock();
    await sessionHandlers[0]({}, ctx);
    ctx.ui.setTitle("my-project");
    ctx.clearTitles();

    await startHandlers[0]({}, ctx);
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()).toHaveLength(1);

    await shutdownHandlers[0]({}, ctx);
    // After shutdown, timer should be cleared and base title restored
    expect(ctx.getTitles()[ctx.getTitles().length - 1]).toBe("my-project");

    // Further timer ticks should not produce new titles
    vi.advanceTimersByTime(200);
    expect(ctx.getTitles().length).toBeLessThanOrEqual(2);
  });

  it("defaults to 'pi' when no title was set", async () => {
    const pi = createPiMock();
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const sessionHandlers = pi.getHandlers("session_start");
    const startHandlers = pi.getHandlers("agent_start");
    const endHandlers = pi.getHandlers("agent_end");

    const ctx = createCtxMock();
    await sessionHandlers[0]({}, ctx);

    await startHandlers[0]({}, ctx);
    vi.advanceTimersByTime(80);
    expect(ctx.getTitles()[0]).toMatch(/^⠋ pi$/);

    await endHandlers[0]({}, ctx);
    expect(ctx.getTitles()[ctx.getTitles().length - 1]).toBe("pi");
  });
});
