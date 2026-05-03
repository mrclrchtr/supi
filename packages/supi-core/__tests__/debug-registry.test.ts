import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDebugEvents,
  configureDebugRegistry,
  getDebugEvents,
  getDebugRegistryConfig,
  getDebugSummary,
  recordDebugEvent,
  redactDebugData,
  resetDebugRegistry,
} from "../debug-registry.ts";

describe("debug registry", () => {
  beforeEach(() => {
    resetDebugRegistry();
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
  });

  it("does not retain events when disabled", () => {
    configureDebugRegistry({ enabled: false });

    const event = recordDebugEvent({
      source: "rtk",
      level: "warning",
      category: "fallback",
      message: "fallback",
    });

    expect(event).toBeNull();
    expect(getDebugEvents().events).toEqual([]);
  });

  it("records events with ids and timestamps when enabled", () => {
    configureDebugRegistry({ enabled: true });

    recordDebugEvent({
      source: "rtk",
      level: "warning",
      category: "fallback",
      message: "rewrite failed",
      cwd: "/repo",
      data: { reason: "timeout" },
    });

    expect(getDebugEvents().events).toEqual([
      {
        id: 1,
        timestamp: 1_700_000_000_000,
        source: "rtk",
        level: "warning",
        category: "fallback",
        message: "rewrite failed",
        cwd: "/repo",
        data: { reason: "timeout" },
      },
    ]);
  });

  it("trims oldest events when maxEvents is exceeded", () => {
    configureDebugRegistry({ enabled: true, maxEvents: 2 });

    recordDebugEvent({ source: "a", level: "debug", category: "one", message: "one" });
    recordDebugEvent({ source: "a", level: "debug", category: "two", message: "two" });
    recordDebugEvent({ source: "a", level: "debug", category: "three", message: "three" });

    expect(getDebugEvents().events.map((event) => event.category)).toEqual(["three", "two"]);
  });

  it("filters by source, level, and category with newest-first limits", () => {
    configureDebugRegistry({ enabled: true, maxEvents: 10 });

    recordDebugEvent({ source: "rtk", level: "warning", category: "fallback", message: "one" });
    recordDebugEvent({ source: "lsp", level: "error", category: "diagnostic", message: "two" });
    recordDebugEvent({ source: "rtk", level: "warning", category: "fallback", message: "three" });

    const result = getDebugEvents({
      source: "rtk",
      level: "warning",
      category: "fallback",
      limit: 1,
    });

    expect(result.events.map((event) => event.message)).toEqual(["three"]);
  });

  it("returns sanitized data by default and raw data only when explicitly allowed", () => {
    configureDebugRegistry({ enabled: true, agentAccess: "sanitized" });
    const secretKey = ["api", "_key"].join("");
    const queryKey = ["api", "Key"].join("");
    const rawCommand = `${secretKey}=abc echo ok https://example.test?${queryKey}=xyz`;
    recordDebugEvent({
      source: "rtk",
      level: "warning",
      category: "fallback",
      message: "secret command",
      data: { command: rawCommand },
      rawData: { command: rawCommand },
    });

    const sanitized = getDebugEvents();
    const expectedRedactedCommand = `${secretKey}=[REDACTED] echo ok https://example.test?${queryKey}=[REDACTED]`;
    expect(sanitized.rawAccessDenied).toBe(false);
    expect(sanitized.events[0]?.data).toEqual({
      command: expectedRedactedCommand,
    });
    expect(sanitized.events[0]).not.toHaveProperty("rawData");

    const denied = getDebugEvents({ includeRaw: true, allowRaw: true });
    expect(denied.rawAccessDenied).toBe(true);
    expect(denied.events[0]).not.toHaveProperty("rawData");

    configureDebugRegistry({ agentAccess: "raw" });
    const raw = getDebugEvents({ includeRaw: true, allowRaw: true });
    expect(raw.rawAccessDenied).toBe(false);
    expect(raw.events[0]?.rawData).toEqual({
      command: rawCommand,
    });
  });

  it("redacts secret-like keys recursively while preserving normal fields", () => {
    expect(
      redactDebugData({
        cwd: "/repo",
        reason: "timeout",
        durationMs: 5000,
        nested: { password: "secret", authorization: "Bearer abc" },
      }),
    ).toEqual({
      cwd: "/repo",
      reason: "timeout",
      durationMs: 5000,
      nested: { password: "[REDACTED]", authorization: "[REDACTED]" },
    });
  });

  it("summarizes events by level and source", () => {
    configureDebugRegistry({ enabled: true });

    recordDebugEvent({ source: "rtk", level: "warning", category: "fallback", message: "one" });
    recordDebugEvent({ source: "rtk", level: "debug", category: "rewrite", message: "two" });
    recordDebugEvent({ source: "lsp", level: "warning", category: "diagnostic", message: "three" });

    expect(getDebugSummary()).toEqual({
      total: 3,
      byLevel: { warning: 2, debug: 1 },
      bySource: { rtk: 2, lsp: 1 },
    });
  });

  it("clears events and resets configuration", () => {
    configureDebugRegistry({ enabled: true, maxEvents: 5 });
    recordDebugEvent({ source: "rtk", level: "warning", category: "fallback", message: "one" });

    clearDebugEvents();
    expect(getDebugEvents().events).toEqual([]);
    expect(getDebugRegistryConfig().enabled).toBe(true);

    resetDebugRegistry();
    expect(getDebugRegistryConfig().enabled).toBe(false);
  });
});
