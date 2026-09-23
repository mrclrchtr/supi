import { afterEach, describe, expect, it } from "vitest";
import {
  clearPendingSessionCapabilityForks,
  decodeSessionCapabilities,
  findSessionCapabilities,
  getSessionCapabilitySkillProvider,
  readPendingSessionCapabilityFork,
  registerSessionCapabilitySkillProvider,
  SESSION_CAPABILITIES_ENTRY,
  sessionCapabilityState,
  setPendingSessionCapabilityFork,
} from "../../src/session.ts";

const state = {
  version: 1 as const,
  eligibleToolNames: ["code_find", "code_graph"],
  initiallyInactiveToolNames: ["code_graph"],
  toolDenylist: ["code_find"],
  hiddenSkillNames: ["review"],
};

afterEach(() => {
  sessionCapabilityState.clear("session-a");
  sessionCapabilityState.clear("session-b");
  clearPendingSessionCapabilityForks();
});

describe("session capability state", () => {
  it("keeps snapshots isolated by session identity", () => {
    sessionCapabilityState.set("session-a", state);
    sessionCapabilityState.set("session-b", {
      ...state,
      hiddenSkillNames: ["docs"],
    });

    const first = sessionCapabilityState.get("session-a");
    first?.hiddenSkillNames.push("changed");

    expect(sessionCapabilityState.get("session-a")?.hiddenSkillNames).toEqual(["review"]);
    expect(sessionCapabilityState.get("session-b")?.hiddenSkillNames).toEqual(["docs"]);
  });

  it("does not enable tools that were inactive at startup", () => {
    expect(decodeSessionCapabilities(state)?.toolDenylist).toEqual(["code_find"]);
    expect(decodeSessionCapabilities(state)?.eligibleToolNames).toEqual(["code_find"]);
  });

  it("keeps only eligible, non-denied explicit tool enables", () => {
    expect(
      decodeSessionCapabilities({
        ...state,
        toolDenylist: [],
        toolEnabledNames: ["code_find", "code_graph", "missing-tool"],
      })?.toolEnabledNames,
    ).toEqual(["code_find"]);
  });

  it("loads the latest hidden entry across the session tree", () => {
    const entries = [
      {
        type: "custom",
        customType: SESSION_CAPABILITIES_ENTRY,
        data: { ...state, hiddenSkillNames: ["old"] },
      },
      {
        type: "custom",
        customType: SESSION_CAPABILITIES_ENTRY,
        data: { ...state, hiddenSkillNames: ["current"] },
      },
    ];

    expect(findSessionCapabilities(entries)?.hiddenSkillNames).toEqual(["current"]);
  });

  it("keeps optional skill providers isolated by session identity", () => {
    const provider = { listEligibleSkills: () => [{ name: "review", description: "Review code" }] };
    const dispose = registerSessionCapabilitySkillProvider("session-a", provider);

    expect(getSessionCapabilitySkillProvider("session-a")).toBe(provider);
    expect(getSessionCapabilitySkillProvider("session-b")).toBeUndefined();

    dispose();
    expect(getSessionCapabilitySkillProvider("session-a")).toBeUndefined();
  });

  it("copies an ephemeral fork snapshot once", () => {
    setPendingSessionCapabilityFork(undefined, state);

    expect(readPendingSessionCapabilityFork(undefined)).toEqual(decodeSessionCapabilities(state));
    expect(readPendingSessionCapabilityFork(undefined)).toBeUndefined();
  });
});
