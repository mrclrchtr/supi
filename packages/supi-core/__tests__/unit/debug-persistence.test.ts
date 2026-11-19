import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canPersistDebugEvent,
  canRecordAgentRunRetrospective,
  configureDebugRegistry,
  DEBUG_REGISTRY_DEFAULTS,
  getDebugEvents,
  recordDebugEvent,
  resetDebugRegistry,
  subscribeDebugEvents,
  subscribeDebugPersistence,
} from "../../src/debug.ts";

describe("debug persistence sink", () => {
  beforeEach(() => {
    resetDebugRegistry();
  });

  it("requires Debug, explicit retrospective opt-in, and an active persistence sink", () => {
    expect(DEBUG_REGISTRY_DEFAULTS.agentRunRetrospectivesEnabled).toBe(false);
    expect(canRecordAgentRunRetrospective()).toBe(false);

    configureDebugRegistry({ enabled: true, agentRunRetrospectivesEnabled: true });
    expect(canRecordAgentRunRetrospective()).toBe(false);

    const unsubscribeEvents = subscribeDebugEvents(vi.fn());
    expect(canRecordAgentRunRetrospective()).toBe(false);
    unsubscribeEvents();

    const persistenceSink = vi.fn();
    const unsubscribePersistence = subscribeDebugPersistence(persistenceSink);
    expect(canRecordAgentRunRetrospective()).toBe(true);

    configureDebugRegistry({ agentRunRetrospectivesEnabled: false });
    expect(canRecordAgentRunRetrospective()).toBe(false);
    configureDebugRegistry({ agentRunRetrospectivesEnabled: true });
    expect(canRecordAgentRunRetrospective()).toBe(true);

    configureDebugRegistry({ enabled: false });
    expect(canRecordAgentRunRetrospective()).toBe(false);
    configureDebugRegistry({ enabled: true });
    expect(canRecordAgentRunRetrospective()).toBe(true);

    unsubscribePersistence();
    expect(canRecordAgentRunRetrospective()).toBe(false);
    recordDebugEvent({
      source: "agent-run",
      level: "info",
      category: "retrospective",
      message: "Agent Run retrospective captured",
    });
    expect(persistenceSink).not.toHaveBeenCalled();
  });

  it("persists only events at or above persistLevel while retaining all events live", () => {
    configureDebugRegistry({ enabled: true });
    const persisted = vi.fn();
    subscribeDebugPersistence(persisted);
    const record = (level: "debug" | "info" | "warning") =>
      recordDebugEvent({ source: "test", level, category: `c.${level}`, message: level });

    expect(DEBUG_REGISTRY_DEFAULTS.persistLevel).toBe("info");
    record("debug");
    record("info");
    expect(persisted.mock.calls.map(([event]) => event.level)).toEqual(["info"]);
    expect(getDebugEvents().events.map((event) => event.level)).toEqual(["info", "debug"]);

    persisted.mockClear();
    configureDebugRegistry({ persistLevel: "debug" });
    record("debug");
    expect(persisted).toHaveBeenCalledOnce();

    persisted.mockClear();
    configureDebugRegistry({ persistLevel: "warning", agentRunRetrospectivesEnabled: true });
    record("info");
    record("warning");
    expect(persisted.mock.calls.map(([event]) => event.level)).toEqual(["warning"]);
    // Retrospectives are info-level, so a stricter threshold makes them ineligible.
    expect(canRecordAgentRunRetrospective()).toBe(false);
    expect(canPersistDebugEvent("info")).toBe(false);
    expect(canPersistDebugEvent("warning")).toBe(true);
  });

  it("reports persistability without the retrospective opt-in", () => {
    expect(canPersistDebugEvent()).toBe(false);
    configureDebugRegistry({ enabled: true });
    expect(canPersistDebugEvent()).toBe(false);
    const unsubscribe = subscribeDebugPersistence(vi.fn());
    expect(canPersistDebugEvent()).toBe(true);
    expect(canRecordAgentRunRetrospective()).toBe(false);
    unsubscribe();
    expect(canPersistDebugEvent()).toBe(false);
  });

  it("sends best-effort-redacted retrospective prose to persistence sinks", () => {
    configureDebugRegistry({
      enabled: true,
      agentRunRetrospectivesEnabled: true,
    });
    const persisted = vi.fn();
    const ordinaryListener = vi.fn();
    subscribeDebugPersistence(persisted);
    subscribeDebugEvents(ordinaryListener);

    const message = "Agent Run retrospective captured";
    const prose = "Observed friction: API_TOKEN=private retry suggestion was untested.";
    recordDebugEvent({
      source: "agent-run",
      level: "info",
      category: "retrospective",
      message,
      data: { runId: "run-42", caller: "delegation", retrospective: prose },
    });

    expect(persisted).toHaveBeenCalledWith(
      expect.objectContaining({
        message,
        data: {
          runId: "run-42",
          caller: "delegation",
          retrospective: "Observed friction: API_TOKEN=[REDACTED] retry suggestion was untested.",
        },
      }),
    );
    expect(ordinaryListener).toHaveBeenCalledOnce();
  });
});
