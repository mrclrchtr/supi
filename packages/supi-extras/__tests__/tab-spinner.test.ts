import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import tabSpinner from "../src/tab-spinner.ts";

describe("tabSpinner extension", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows spinner during agent_start and ✓ on agent_end", async () => {
    const pi = createPiMock({ sessionName: "my-project" });
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    // Capture setTitle calls
    const titles: string[] = [];
    const ctx = makeCtx({
      cwd: "/home/projects/foo",
      ui: {
        setStatus: vi.fn(),
        notify: vi.fn(),
        setTitle: (title: string) => {
          titles.push(title);
        },
        setWidget: vi.fn(),
        removeWidget: vi.fn(),
        getEditorText: vi.fn(() => ""),
        setEditorText: vi.fn(),
        input: vi.fn(async () => undefined),
        custom: vi.fn(async () => null),
        theme: {
          accent: "cyan",
          dim: "gray",
          error: "red",
          warning: "yellow",
          success: "green",
          fg: (_color: string, text: string) => text,
          bg: (_color: string, text: string) => text,
          bold: (text: string) => text,
        },
      },
    });

    const agStart = pi.handlers.get("agent_start")?.[0] as (
      event: unknown,
      context: unknown,
    ) => Promise<unknown>;
    const agEnd = pi.handlers.get("agent_end")?.[0] as (
      event: unknown,
      context: unknown,
    ) => Promise<unknown>;
    expect(agStart).toBeDefined();
    expect(agEnd).toBeDefined();

    // Start the agent
    await agStart({}, ctx);

    // Advance timers to trigger one spinner tick
    vi.advanceTimersByTime(80);
    expect(titles.length).toBeGreaterThanOrEqual(1);
    const spinnerTitle = titles[titles.length - 1];
    expect(spinnerTitle).toBe("⠋ π - my-project - foo");

    // End the agent
    await agEnd({}, ctx);
    expect(titles[titles.length - 1]).toBe("✓ π - my-project - foo");
  });

  it("reacts to supi:working:start and supi:working:end events", async () => {
    const pi = createPiMock({ sessionName: "ws" });
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const titles: string[] = [];
    const ctx = makeCtx({
      cwd: "/tmp",
      ui: {
        setStatus: vi.fn(),
        notify: vi.fn(),
        setTitle: (title: string) => {
          titles.push(title);
        },
        setWidget: vi.fn(),
        removeWidget: vi.fn(),
        getEditorText: vi.fn(() => ""),
        setEditorText: vi.fn(),
        input: vi.fn(async () => undefined),
        custom: vi.fn(async () => null),
        theme: {
          accent: "cyan",
          dim: "gray",
          error: "red",
          warning: "yellow",
          success: "green",
          fg: (_color: string, text: string) => text,
          bg: (_color: string, text: string) => text,
          bold: (text: string) => text,
        },
      },
    });

    // Establish currentCtx by starting and stopping the agent first
    const startHandler = pi.handlers.get("agent_start")?.[0] as (
      event: unknown,
      context: unknown
    ) => Promise<unknown>;
    const endHandler = pi.handlers.get("agent_end")?.[0] as (
      event: unknown,
      context: unknown
    ) => Promise<unknown>;
    await startHandler({}, ctx);
    await endHandler({}, ctx);
    titles.length = 0;

    // Emit working start — spinner should resume because currentCtx is set
    pi.events.emit("supi:working:start", { source: "supi-review" });

    // Advance timers for one tick
    vi.advanceTimersByTime(80);
    expect(titles.length).toBeGreaterThanOrEqual(1);
    const spinnerTitle = titles[titles.length - 1];
    expect(spinnerTitle).toBe("⠋ π - ws - tmp");

    // Emit working end — decrement calls stop() which shows base title
    pi.events.emit("supi:working:end", { source: "supi-review" });
    expect(titles[titles.length - 1]).toBe("π - ws - tmp");
  });

  it("stops spinner on session_shutdown", async () => {
    const pi = createPiMock();
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const titles: string[] = [];
    const ctx = makeCtx({
      cwd: "/tmp",
      ui: {
        setStatus: vi.fn(),
        notify: vi.fn(),
        setTitle: (title: string) => {
          titles.push(title);
        },
        setWidget: vi.fn(),
        removeWidget: vi.fn(),
        getEditorText: vi.fn(() => ""),
        setEditorText: vi.fn(),
        input: vi.fn(async () => undefined),
        custom: vi.fn(async () => null),
        theme: {
          accent: "cyan",
          dim: "gray",
          error: "red",
          warning: "yellow",
          success: "green",
          fg: (_color: string, text: string) => text,
          bg: (_color: string, text: string) => text,
          bold: (text: string) => text,
        },
      },
    });

    const agStart = pi.handlers.get("agent_start")?.[0] as (
      event: unknown,
      context: unknown,
    ) => Promise<unknown>;
    const shutdown = pi.handlers.get("session_shutdown")?.[0] as (
      ...args: unknown[]
    ) => Promise<unknown>;
    expect(agStart).toBeDefined();
    expect(shutdown).toBeDefined();

    await agStart({}, ctx);
    vi.advanceTimersByTime(80);
    expect(titles.length).toBeGreaterThanOrEqual(1);

    // Shutdown calls stop() which clears the spinner and shows the base title
    await shutdown({}, ctx);
    const lastTitle = titles[titles.length - 1];
    expect(lastTitle).toBe("π - tmp");
  });

  it("pauses spinner on supi:ask-user:start and resumes on supi:ask-user:end", async () => {
    const pi = createPiMock({ sessionName: "my-project" });
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const startHandlers = pi.getHandlers("agent_start");
    const titles: string[] = [];
    const ctx = makeCtx({
      cwd: "/tmp",
      ui: { setTitle: (t: string) => titles.push(t) },
    });
    await startHandlers[0]({}, ctx);
    titles.length = 0;
    vi.advanceTimersByTime(80);
    expect(titles).toHaveLength(1); // one tick before pause

    // Pause: no titles should appear after this
    pi.events.emit("supi:ask-user:start", { source: "supi-ask-user" });
    titles.length = 0;
    vi.advanceTimersByTime(200);
    expect(titles).toHaveLength(0);

    // Resume: spinner should start ticking again (continues from stored frame)
    pi.events.emit("supi:ask-user:end", { source: "supi-ask-user" });
    vi.advanceTimersByTime(80);
    expect(titles).toHaveLength(1);
    expect(titles[0]).toMatch(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] π - my-project - tmp$/);
  });

  it("unbalanced supi:working:end does not stop spinner while agent is active", async () => {
    const pi = createPiMock({ sessionName: "my-project" });
    tabSpinner(pi as unknown as Parameters<typeof tabSpinner>[0]);

    const startHandlers = pi.getHandlers("agent_start");
    const endHandlers = pi.getHandlers("agent_end");

    const titles: string[] = [];
    const ctx = makeCtx({
      cwd: "/tmp",
      ui: { setTitle: (t: string) => titles.push(t) },
    });
    await startHandlers[0]({}, ctx);
    titles.length = 0;
    vi.advanceTimersByTime(80);
    expect(titles[0]).toMatch(/^⠋ π - my-project - tmp$/);

    // An unbalanced end (no matching start) should not drop below the agent's floor
    pi.events.emit("supi:working:end", { source: "supi-review" });
    titles.length = 0;
    vi.advanceTimersByTime(80);
    expect(titles[0]).toMatch(/^⠙ π - my-project - tmp$/);

    // agent_end still shows ✓ when agent finishes
    await endHandlers[0]({}, ctx);
    expect(titles[titles.length - 1]).toBe("✓ π - my-project - tmp");
  });
});
