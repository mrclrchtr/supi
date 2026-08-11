import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "../../src/debug-registry.ts";
import { startDebugTimer } from "../../src/debug-timing.ts";

beforeEach(() => {
  resetDebugRegistry();
});

describe("debug timing", () => {
  it("does not read the clock or event factory when Debug is disabled", () => {
    const now = vi.fn<() => number>();
    const eventFactory = vi.fn(() => ({
      source: "test",
      level: "debug" as const,
      category: "timing",
      message: "timed",
    }));
    const timer = startDebugTimer({ now });

    timer.mark("work");

    expect(timer.enabled).toBe(false);
    expect(timer.finish(eventFactory, "finish")).toBeNull();
    expect(now).not.toHaveBeenCalled();
    expect(eventFactory).not.toHaveBeenCalled();
  });

  it("isolates clock and event-recording failures from the measured operation", () => {
    configureDebugRegistry({ enabled: true });
    const brokenClock = startDebugTimer({
      now: () => {
        throw new Error("clock failed");
      },
    });

    expect(brokenClock.enabled).toBe(false);
    expect(() => brokenClock.mark("work")).not.toThrow();
    expect(
      brokenClock.finish(() => {
        throw new Error("event failed");
      }),
    ).toBeNull();

    const timer = startDebugTimer({ now: () => 1 });
    expect(() =>
      timer.finish(() => {
        throw new Error("event failed");
      }),
    ).not.toThrow();
    expect(getDebugEvents().events).toEqual([]);
  });

  it("records monotonic total and phase timings once", () => {
    configureDebugRegistry({ enabled: true });
    const now = vi
      .fn<() => number>()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(12.34)
      .mockReturnValueOnce(30.09);
    const timer = startDebugTimer({ now });

    expect(timer.enabled).toBe(true);
    timer.mark("enumeration");
    const event = timer.finish(
      {
        source: "code-intelligence",
        level: "debug",
        category: "ast-scan.timing",
        message: "AST scan complete",
        data: { analyzedFileCount: 10 },
      },
      "analysis",
    );

    expect(event?.data).toEqual({
      analyzedFileCount: 10,
      timing: {
        durationMs: 30.1,
        phasesMs: { enumeration: 12.3, analysis: 17.8 },
      },
    });
    expect(
      timer.finish({
        source: "test",
        level: "debug",
        category: "duplicate",
        message: "duplicate",
      }),
    ).toBeNull();
    expect(getDebugEvents().events).toHaveLength(1);
  });
});
