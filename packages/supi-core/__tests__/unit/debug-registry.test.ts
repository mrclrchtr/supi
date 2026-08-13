import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDebugEvents,
  configureDebugRegistry,
  DEBUG_REGISTRY_DEFAULTS,
  getDebugEvents,
  getDebugRegistryConfig,
  getDebugSummary,
  isDebugLevel,
  isDebugOperationId,
  matchesDebugEventQuery,
  recordDebugEvent,
  redactDebugData,
  resetDebugRegistry,
  subscribeDebugEvents,
} from "../../src/debug-registry.ts";

describe("debug registry", () => {
  beforeEach(() => {
    resetDebugRegistry();
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
  });

  it("shares debug-level recognition and filter matching", () => {
    expect(isDebugLevel("warning")).toBe(true);
    expect(isDebugLevel("notice")).toBe(false);
    expect(
      matchesDebugEventQuery(
        { source: "lsp", level: "warning", category: "fallback" },
        { source: "lsp", level: "warning" },
      ),
    ).toBe(true);
  });

  it("validates the exact Debug Operation ID form", () => {
    expect(isDebugOperationId("op-AAAAAAAAAAAAAAAAAAAAAA")).toBe(true);
    expect(isDebugOperationId("op-_____________________w")).toBe(true);
    expect(isDebugOperationId("op-AAAAAAAAAAAAAAAAAAAAAB")).toBe(false);
    expect(isDebugOperationId("op-AAAAAAAAAAAAAAAAAAAAAA=")).toBe(false);
    expect(isDebugOperationId("tool-call-raw")).toBe(false);
  });

  it("does not retain events when disabled", () => {
    configureDebugRegistry({ enabled: false });

    const event = recordDebugEvent({
      source: "lsp",
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
      source: "lsp",
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
        source: "lsp",
        level: "warning",
        category: "fallback",
        message: "rewrite failed",
        cwd: "/repo",
        data: { reason: "timeout" },
      },
    ]);
  });

  it("notifies listeners with sanitized events and supports unsubscribe", () => {
    configureDebugRegistry({ enabled: true });
    const listener = vi.fn();
    const unsubscribe = subscribeDebugEvents(listener);

    recordDebugEvent({
      source: "lsp",
      level: "warning",
      category: "fallback",
      message: "first",
      data: { token: "secret" },
      rawData: { token: "secret" },
    });
    unsubscribe();
    recordDebugEvent({ source: "lsp", level: "warning", category: "fallback", message: "second" });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({
      id: 1,
      timestamp: 1_700_000_000_000,
      source: "lsp",
      level: "warning",
      category: "fallback",
      message: "first",
      cwd: undefined,
      data: { token: "[REDACTED]" },
    });
  });

  it("trims oldest events when maxEvents is exceeded", () => {
    configureDebugRegistry({ enabled: true, maxEvents: 2 });

    recordDebugEvent({ source: "a", level: "debug", category: "one", message: "one" });
    recordDebugEvent({ source: "a", level: "debug", category: "two", message: "two" });
    recordDebugEvent({ source: "a", level: "debug", category: "three", message: "three" });

    expect(getDebugEvents().events.map((event) => event.category)).toEqual(["three", "two"]);
  });

  it("filters by operation, source, level, and category with newest-first limits", () => {
    configureDebugRegistry({ enabled: true, maxEvents: 10 });
    const operationId = "op-AAAAAAAAAAAAAAAAAAAAAA";

    recordDebugEvent({
      source: "lsp",
      level: "warning",
      category: "fallback",
      message: "one",
      operationId,
    });
    recordDebugEvent({
      source: "lsp",
      level: "error",
      category: "diagnostic",
      message: "two",
      operationId,
    });
    recordDebugEvent({ source: "lsp", level: "warning", category: "fallback", message: "other" });
    recordDebugEvent({
      source: "lsp",
      level: "warning",
      category: "fallback",
      message: "three",
      operationId,
    });

    const result = getDebugEvents({
      operationId,
      source: "lsp",
      level: "warning",
      category: "fallback",
      limit: 1,
    });

    expect(result.events).toEqual([expect.objectContaining({ message: "three", operationId })]);
  });

  it("does not retain an invalid Debug Operation ID", () => {
    configureDebugRegistry({ enabled: true });

    expect(
      recordDebugEvent({
        source: "lsp",
        level: "debug",
        category: "request.timing",
        message: "request",
        operationId: "raw-tool-call-id",
      }),
    ).toBeNull();
    expect(getDebugEvents().events).toEqual([]);
  });

  it("returns sanitized data by default and raw data only when explicitly allowed", () => {
    configureDebugRegistry({ enabled: true, agentAccess: "sanitized" });
    const secretKey = ["api", "_key"].join("");
    const queryKey = ["api", "Key"].join("");
    const rawCommand = `${secretKey}=abc echo ok https://example.test?${queryKey}=xyz`;
    recordDebugEvent({
      source: "lsp",
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

    recordDebugEvent({ source: "lsp", level: "warning", category: "fallback", message: "one" });
    recordDebugEvent({ source: "lsp", level: "debug", category: "rewrite", message: "two" });
    recordDebugEvent({ source: "lsp", level: "warning", category: "diagnostic", message: "three" });

    expect(getDebugSummary()).toEqual({
      total: 3,
      byLevel: { warning: 2, debug: 1 },
      bySource: { lsp: 3 },
    });
  });

  it("clamps NaN maxEvents to default", () => {
    configureDebugRegistry({ enabled: true, maxEvents: Number.NaN });
    expect(getDebugRegistryConfig().maxEvents).toBe(DEBUG_REGISTRY_DEFAULTS.maxEvents);
  });

  it("clamps negative maxEvents to default", () => {
    configureDebugRegistry({ enabled: true, maxEvents: -1 });
    expect(getDebugRegistryConfig().maxEvents).toBe(DEBUG_REGISTRY_DEFAULTS.maxEvents);
  });

  it("clamps Infinity maxEvents to default", () => {
    configureDebugRegistry({ enabled: true, maxEvents: Infinity });
    expect(getDebugRegistryConfig().maxEvents).toBe(DEBUG_REGISTRY_DEFAULTS.maxEvents);
  });

  it("clears events and resets configuration", () => {
    configureDebugRegistry({ enabled: true, maxEvents: 5 });
    recordDebugEvent({ source: "lsp", level: "warning", category: "fallback", message: "one" });

    clearDebugEvents();
    expect(getDebugEvents().events).toEqual([]);
    expect(getDebugRegistryConfig().enabled).toBe(true);

    resetDebugRegistry();
    expect(getDebugRegistryConfig().enabled).toBe(false);
  });
});
