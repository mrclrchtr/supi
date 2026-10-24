import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canRecordAgentRunRetrospective,
  configureDebugRegistry,
  DEBUG_REGISTRY_DEFAULTS,
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
